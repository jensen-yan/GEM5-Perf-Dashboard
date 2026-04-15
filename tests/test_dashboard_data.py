from pathlib import Path
import unittest

from scripts.dashboard_data import (
    AVG_LABEL,
    benchmark_metrics,
    classify_run,
    make_commit_url,
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


class ClassifyRunTest(unittest.TestCase):
    def test_classifies_align_push_dataset(self) -> None:
        run = {
            'name': 'gem5 Align BTB Performance Test(0.3c)',
            'event': 'push',
            'head_branch': 'xs-dev',
        }
        dataset = classify_run(run, 'performance-score-gcc15-spec06-0.3c')
        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.id, 'kmhv3-gcc15-spec06-0.3c')

    def test_rejects_non_mainline_or_unknown_runs(self) -> None:
        run = {
            'name': 'gem5 Align BTB Performance Test(0.3c)',
            'event': 'workflow_dispatch',
            'head_branch': 'feature-branch',
        }
        dataset = classify_run(run, 'performance-score-gcc15-spec06-0.3c')
        self.assertIsNone(dataset)


class CommitUrlTest(unittest.TestCase):
    def test_make_commit_url(self) -> None:
        self.assertEqual(
            make_commit_url('deadbeef1234'),
            'https://github.com/OpenXiangShan/GEM5/commit/deadbeef1234',
        )


if __name__ == '__main__':
    unittest.main()
