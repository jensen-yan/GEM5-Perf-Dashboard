import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from scripts.dashboard_data import DATASET_BY_ID
from scripts.update_data import (
    collect_run,
    extract_score_text,
    find_dataset_artifact,
    find_dataset_job,
    list_workflow_runs,
    select_run_for_dataset,
    write_outputs,
)


def make_zip(entries: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, text in entries.items():
            archive.writestr(name, text)
    return buffer.getvalue()


class ExtractScoreTextTest(unittest.TestCase):
    def test_reads_score_from_artifact_root(self) -> None:
        self.assertEqual(
            extract_score_text(make_zip({"score.txt": "root score\n"})),
            "root score\n",
        )

    def test_reads_score_from_nested_artifact_path(self) -> None:
        blob = make_zip(
            {
                "cirunner/actions-runner-gem5/node028-1/_work/GEM5/GEM5/score.txt": (
                    "nested score\n"
                )
            }
        )

        self.assertEqual(extract_score_text(blob), "nested score\n")

    def test_rejects_artifact_without_score(self) -> None:
        with self.assertRaisesRegex(ValueError, "found 0: none"):
            extract_score_text(make_zip({"summary.txt": "not a score\n"}))

    def test_rejects_ambiguous_score_files(self) -> None:
        blob = make_zip(
            {
                "first/score.txt": "first score\n",
                "second/score.txt": "second score\n",
            }
        )

        with self.assertRaisesRegex(ValueError, "found 2"):
            extract_score_text(blob)


class SelectRunForDatasetTest(unittest.TestCase):
    def test_picks_matching_workflow_for_commit(self) -> None:
        dataset = DATASET_BY_ID['idealkmhv3-gcc15-spec06-0.3c']
        runs = [
            {
                'id': 1201,
                'name': 'gem5 Performance Test (Tier 2 - Post-Merge)',
                'path': '.github/workflows/gem5-perf.yml',
                'event': 'push',
                'head_branch': 'xs-dev',
                'conclusion': 'success',
            },
            {
                'id': 1400,
                'name': 'gem5 Ideal BTB Performance Test',
                'path': '.github/workflows/gem5-ideal-btb-perf.yml',
                'event': 'push',
                'head_branch': 'xs-dev',
                'conclusion': 'success',
            },
        ]

        selected = select_run_for_dataset(runs, dataset)

        self.assertIsNotNone(selected)
        self.assertEqual(selected['id'], 1400)

    def test_ignores_unsuccessful_or_wrong_branch_runs(self) -> None:
        dataset = DATASET_BY_ID['kmhv3-gcc15-spec06-0.3c']
        runs = [
            {
                'id': 10,
                'name': 'gem5 Align BTB Performance Test(0.3c)',
                'path': '.github/workflows/gem5-align-btb-0.3c.yml',
                'event': 'push',
                'head_branch': 'topic',
                'conclusion': 'success',
            },
            {
                'id': 11,
                'name': 'gem5 Align BTB Performance Test(0.3c)',
                'path': '.github/workflows/gem5-align-btb-0.3c.yml',
                'event': 'push',
                'head_branch': 'xs-dev',
                'conclusion': 'failure',
            },
        ]

        self.assertIsNone(select_run_for_dataset(runs, dataset))


class ListWorkflowRunsTest(unittest.TestCase):
    @patch('scripts.update_data.gh_api_json')
    def test_fetches_latest_runs_without_stale_branch_filter(self, api_json) -> None:
        api_json.return_value = {'workflow_runs': []}

        list_workflow_runs(
            '.github/workflows/gem5-align-btb-0.3c.yml',
            max_pages=1,
            per_page=20,
        )

        api_json.assert_called_once_with(
            'repos/OpenXiangShan/GEM5/actions/workflows/'
            'gem5-align-btb-0.3c.yml/runs?per_page=20&page=1'
        )


class FindDatasetArtifactTest(unittest.TestCase):
    def test_selects_exact_unexpired_artifact(self) -> None:
        dataset = DATASET_BY_ID['idealkmhv3-gcc15-spec06-0.3c']
        artifacts = [
            {'id': 1, 'name': 'performance-score-gcc15-spec06-0.3c-debug', 'expired': False},
            {'id': 2, 'name': 'performance-score-gcc15-spec06-0.3c', 'expired': True},
            {'id': 3, 'name': 'performance-score-gcc15-spec06-0.3c', 'expired': False},
        ]

        artifact = find_dataset_artifact(artifacts, dataset)

        self.assertIsNotNone(artifact)
        self.assertEqual(artifact['id'], 3)

    def test_selects_artifact_nearest_to_dataset_job(self) -> None:
        dataset = DATASET_BY_ID['weekly-kmhv3-spec17-1.0c']
        job = {
            'name': 'align_test_spec17 / XS-GEM5 - Run performance test (spec17-1.0c)',
            'conclusion': 'success',
            'completed_at': '2026-07-02T22:25:08Z',
        }
        artifacts = [
            {
                'id': 1,
                'name': 'performance-score-spec17-1.0c',
                'expired': False,
                'created_at': '2026-07-02T22:20:11Z',
            },
            {
                'id': 2,
                'name': 'performance-score-spec17-1.0c',
                'expired': False,
                'created_at': '2026-07-02T22:24:32Z',
            },
        ]

        artifact = find_dataset_artifact(artifacts, dataset, job)

        self.assertIsNotNone(artifact)
        self.assertEqual(artifact['id'], 2)


    def test_new_names_separate_configs_and_take_priority_over_legacy(self) -> None:
        datasets = [DATASET_BY_ID[key] for key in (
            'weekly-kmhv3-spec17-1.0c',
            'weekly-idealkmhv3-spec17-1.0c',
            'weekly-smt-idealkmhv3-gcc12-spec06-smt-1.0c',
        )]
        artifacts = [
            {'id': 0, 'name': 'performance-score-spec17-1.0c'},
            {'id': 1, 'name': 'score-spec17-1.0c'},
            {'id': 2, 'name': 'score-ideal-spec17-1.0c'},
            {'id': 3, 'name': 'score-smt-ideal-gcc12-spec06-smt-1.0c'},
        ]
        for expected, dataset in enumerate(datasets, 1):
            with self.subTest(dataset=dataset.id):
                self.assertEqual(find_dataset_artifact(artifacts, dataset)['id'], expected)

    def test_expired_new_artifact_falls_back_to_legacy(self) -> None:
        dataset = DATASET_BY_ID['kmhv3-spec06-rva23-novec-gcc16-0.3c']
        artifacts = [
            {'id': 1, 'name': dataset.artifact_name, 'expired': True},
            {'id': 2, 'name': dataset.legacy_artifact_name},
        ]
        self.assertEqual(find_dataset_artifact(artifacts, dataset)['id'], 2)

    def test_legacy_weekly_requires_job_and_unambiguous_timestamps(self) -> None:
        dataset = DATASET_BY_ID['weekly-kmhv3-spec17-1.0c']
        artifact = {'id': 1, 'name': dataset.legacy_artifact_name}
        self.assertIsNone(find_dataset_artifact([artifact], dataset))
        job = {'completed_at': '2026-07-02T22:25:08Z'}
        self.assertIsNone(find_dataset_artifact([artifact], dataset, job))
        artifact['created_at'] = job['completed_at']
        self.assertIsNone(find_dataset_artifact([artifact, dict(artifact, id=2)], dataset, job))


class CollectRunTest(unittest.TestCase):
    @patch('scripts.update_data.include_run')
    @patch('scripts.update_data.list_run_jobs')
    @patch('scripts.update_data.list_run_artifacts')
    def test_new_successful_weekly_needs_no_jobs(self, artifacts, jobs, include) -> None:
        datasets = [DATASET_BY_ID[key] for key in (
            'weekly-kmhv3-spec17-1.0c', 'weekly-idealkmhv3-spec17-1.0c',
        )]
        artifacts.return_value = [
            {'id': i, 'name': dataset.artifact_name}
            for i, dataset in enumerate(datasets)
        ]
        collect_run({'id': 42, 'conclusion': 'success'}, datasets, {})
        jobs.assert_not_called()
        artifacts.assert_called_once_with(42)
        self.assertEqual(include.call_count, 2)
        self.assertEqual([call.args[2]['id'] for call in include.call_args_list], [0, 1])

    @patch('scripts.update_data.include_run')
    @patch('scripts.update_data.list_run_jobs')
    @patch('scripts.update_data.list_run_artifacts')
    def test_partial_failure_only_includes_successful_job(self, artifacts, jobs, include) -> None:
        datasets = [DATASET_BY_ID[key] for key in (
            'weekly-kmhv3-spec17-1.0c', 'weekly-idealkmhv3-spec17-1.0c',
        )]
        for legacy in (False, True):
            with self.subTest(legacy=legacy):
                include.reset_mock()
                jobs.reset_mock()
                artifacts.return_value = [
                    {'id': i, 'name': dataset.legacy_artifact_name if legacy else dataset.artifact_name,
                     'created_at': f'2026-07-02T22:2{i}:00Z'}
                    for i, dataset in enumerate(datasets)
                ]
                jobs.return_value = [
                    {'name': datasets[0].job_name_prefix + 'test', 'conclusion': 'failure'},
                    {'name': datasets[1].job_name_prefix + 'test', 'conclusion': 'success',
                     'completed_at': '2026-07-02T22:21:08Z'},
                ]
                collect_run({'id': 42, 'conclusion': 'failure'}, datasets, {})
                jobs.assert_called_once_with(42)
                include.assert_called_once()
                self.assertEqual(include.call_args.args[1], datasets[1])
                self.assertEqual(include.call_args.args[2]['id'], 1)


class FindDatasetJobTest(unittest.TestCase):
    def test_finds_successful_job_for_dataset_prefix(self) -> None:
        dataset = DATASET_BY_ID['weekly-idealkmhv3-gcc15-spec06-1.0c']
        jobs = [
            {
                'id': 1,
                'name': 'align_test_spec06 / XS-GEM5 - Run performance test (gcc15-spec06-1.0c)',
                'conclusion': 'success',
                'completed_at': '2026-07-02T20:45:31Z',
            },
            {
                'id': 2,
                'name': 'perf_test_spec06 / XS-GEM5 - Run performance test (gcc15-spec06-1.0c)',
                'conclusion': 'success',
                'completed_at': '2026-07-02T20:44:44Z',
            },
        ]

        job = find_dataset_job(jobs, dataset)

        self.assertIsNotNone(job)
        self.assertEqual(job['id'], 2)

    def test_weekly_dataset_jobs_cover_current_workflow(self) -> None:
        expected_prefixes = {
            'align_test_spec06 / ',
            'align_test_spec17 / ',
            'align_test_spec26 / ',
            'perf_test_spec06 / ',
            'perf_test_spec17 / ',
            'perf_test_spec26 / ',
            'perf_test_spec06_gcc12_dynpf / ',
            'smt_test_spec06 / ',
        }
        actual_prefixes = {
            dataset.job_name_prefix
            for dataset in DATASET_BY_ID.values()
            if dataset.workflow_path
            == '.github/workflows/gem5-ideal-btb-perf-weekly.yml'
        }

        self.assertEqual(actual_prefixes, expected_prefixes)


class WriteOutputsTest(unittest.TestCase):
    def test_normalizes_archive_timestamps_before_sorting_points(self) -> None:
        dataset_id = 'idealkmhv3-gcc15-spec06-0.3c'
        points = [
            {
                'run_id': 2,
                'run_number': 2,
                'created_at': '2026-07-08T04:53:51Z',
                'commit': 'july',
                'short_commit': 'jul',
                'commit_url': '',
                'title': '',
                'workflow_url': '',
                'metrics': {'SPECint avg': 2.0},
                'details': {},
            },
            {
                'run_id': 1,
                'run_number': 1,
                'created_at': '20260618_174901',
                'commit': 'june',
                'short_commit': 'jun',
                'commit_url': '',
                'title': '',
                'workflow_url': '',
                'metrics': {'SPECint avg': 1.0},
                'details': {},
            },
        ]

        with tempfile.TemporaryDirectory() as tmp:
            write_outputs({dataset_id: points}, Path(tmp))
            payload = json.loads((Path(tmp) / f'{dataset_id}.json').read_text(encoding='utf-8'))

        self.assertEqual([point['short_commit'] for point in payload['points']], ['jun', 'jul'])
        self.assertEqual(payload['points'][0]['created_at'], '2026-06-18T17:49:01Z')


if __name__ == '__main__':
    unittest.main()
