from pathlib import Path
import unittest

from scripts.dashboard_data import (
    AVG_LABEL,
    DATASET_BY_ID,
    FP_AVG_LABEL,
    OVERALL_AVG_LABEL,
    benchmark_metrics,
    benchmark_names,
    classify_run,
    make_commit_url,
    normalize_created_at,
    point_created_at_sort_key,
    run_matches_dataset,
    parse_score_text,
)

FIXTURE = Path(__file__).parent / 'fixtures' / 'sample_score.txt'


class ParseScoreTextTest(unittest.TestCase):
    def test_parse_specint_average_and_rows(self) -> None:
        parsed = parse_score_text(FIXTURE.read_text(encoding='utf-8'))

        self.assertAlmostEqual(parsed['specint_avg'], 18.69279014105546)
        self.assertIn('perlbench', parsed['benchmarks'])
        self.assertAlmostEqual(parsed['benchmarks']['mcf']['score'], 17.011)
        self.assertAlmostEqual(parsed['benchmarks']['xalancbmk']['coverage'], 0.309)

    def test_benchmark_metrics_includes_avg(self) -> None:
        parsed = parse_score_text(FIXTURE.read_text(encoding='utf-8'))
        metrics = benchmark_metrics(parsed)

        self.assertAlmostEqual(metrics[AVG_LABEL], 18.69279014105546)
        self.assertAlmostEqual(metrics['gcc'], 19.022)

    def test_parse_full_suite_averages_and_fp_rows(self) -> None:
        text = '''
================ Int =================
time         ref_time score      coverage
gcc        120.0     8050.0  22.361       1.0
Estimated Int score per GHz: 20.0
================ FP =================
time         ref_time score      coverage
lbm        150.0     13740.0  30.533       1.0
Estimated FP score per GHz: 21.5
================ Overall =================
Estimated overall score per GHz: 20.75
'''
        parsed = parse_score_text(text)
        metrics = benchmark_metrics(parsed)

        self.assertAlmostEqual(metrics[AVG_LABEL], 20.0)
        self.assertAlmostEqual(metrics[FP_AVG_LABEL], 21.5)
        self.assertAlmostEqual(metrics[OVERALL_AVG_LABEL], 20.75)
        self.assertAlmostEqual(metrics['fp:lbm'], 30.533)
        self.assertIn('fp:lbm', benchmark_names(parsed))


class TimestampTest(unittest.TestCase):
    def test_normalizes_archive_timestamp_for_sorting(self) -> None:
        self.assertEqual(
            normalize_created_at('20260618_174901'),
            '2026-06-18T17:49:01Z',
        )

        points = [
            {'created_at': '2026-07-08T04:53:51Z', 'short_commit': 'jul'},
            {'created_at': '20260618_174901', 'short_commit': 'jun'},
        ]

        sorted_points = sorted(points, key=point_created_at_sort_key)

        self.assertEqual([point['short_commit'] for point in sorted_points], ['jun', 'jul'])


class ClassifyRunTest(unittest.TestCase):
    def test_classifies_align_push_dataset(self) -> None:
        run = {
            'name': 'gem5 Align BTB Performance Test(0.3c)',
            'path': '.github/workflows/gem5-align-btb-0.3c.yml',
            'event': 'push',
            'head_branch': 'xs-dev',
        }
        dataset = classify_run(run, 'performance-score-gcc15-spec06-0.3c')
        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.id, 'kmhv3-gcc15-spec06-0.3c')

    def test_rejects_regular_perf_workflow_for_ideal_dataset(self) -> None:
        run = {
            'name': 'gem5 Performance Test (Tier 2 - Post-Merge)',
            'path': '.github/workflows/gem5-perf.yml',
            'event': 'push',
            'head_branch': 'xs-dev',
        }
        dataset = classify_run(run, 'performance-score-gcc12-spec06-0.8c')
        self.assertIsNone(dataset)

    def test_classifies_current_ideal_push_dataset(self) -> None:
        run = {
            'name': 'gem5 Ideal BTB Performance Test',
            'path': '.github/workflows/gem5-ideal-btb-perf.yml',
            'event': 'push',
            'head_branch': 'xs-dev',
        }

        dataset = classify_run(run, 'performance-score-gcc15-spec06-0.3c')

        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.id, 'idealkmhv3-gcc15-spec06-0.3c')

    def test_rejects_non_mainline_or_unknown_runs(self) -> None:
        run = {
            'name': 'gem5 Align BTB Performance Test(0.3c)',
            'path': '.github/workflows/gem5-align-btb-0.3c.yml',
            'event': 'workflow_dispatch',
            'head_branch': 'feature-branch',
        }
        dataset = classify_run(run, 'performance-score-gcc15-spec06-0.3c')
        self.assertIsNone(dataset)

    def test_run_matches_dataset_requires_expected_workflow_path(self) -> None:
        dataset = DATASET_BY_ID['idealkmhv3-gcc15-spec06-0.8c']
        matching_run = {
            'name': 'gem5 Ideal BTB Performance Test',
            'path': '.github/workflows/gem5-ideal-btb-perf.yml',
            'event': 'push',
            'head_branch': 'xs-dev',
        }
        wrong_path_run = dict(matching_run, path='.github/workflows/gem5-perf.yml')

        self.assertTrue(run_matches_dataset(matching_run, dataset))
        self.assertFalse(run_matches_dataset(wrong_path_run, dataset))

    def test_classifies_weekly_smt_schedule_dataset(self) -> None:
        run = {
            'name': 'gem5 SMT SPEC2006 Performance Test(0.3c)',
            'path': '.github/workflows/gem5-smt-spec06-0.3c.yml',
            'event': 'schedule',
            'head_branch': 'xs-dev',
        }

        dataset = classify_run(run, 'performance-score-gcc12-spec06-smt-0.3c')

        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.id, 'weekly-smt-idealkmhv3-gcc12-spec06-smt-0.3c')

    def test_classifies_current_smt_push_separately_from_weekly(self) -> None:
        run = {
            'name': 'gem5 SMT SPEC2006 Performance Test(0.3c)',
            'path': '.github/workflows/gem5-smt-spec06-0.3c.yml',
            'event': 'push',
            'head_branch': 'xs-dev',
        }

        dataset = classify_run(run, 'performance-score-gcc12-spec06-smt-0.3c')

        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.id, 'smt-idealkmhv3-gcc12-spec06-smt-0.3c')


class CommitUrlTest(unittest.TestCase):
    def test_make_commit_url(self) -> None:
        self.assertEqual(
            make_commit_url('deadbeef1234'),
            'https://github.com/OpenXiangShan/GEM5/commit/deadbeef1234',
        )


if __name__ == '__main__':
    unittest.main()
