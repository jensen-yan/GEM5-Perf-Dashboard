import json
from pathlib import Path
import tempfile
import unittest

from scripts.dashboard_data import DATASET_BY_ID
from scripts.update_data import (
    find_dataset_artifact,
    find_dataset_job,
    select_run_for_dataset,
    write_outputs,
)


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
