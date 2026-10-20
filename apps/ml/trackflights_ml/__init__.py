"""Training and evaluation for the tracker's models.

Feature definitions and the JSON model evaluator live in the ingestor
(apps/ingestor/src/ml), because the Pi computes features and runs models at
serving time. Importing them from there, instead of copying, keeps training
and serving features identical.
"""

import sys
from pathlib import Path

INGESTOR = Path(__file__).resolve().parents[2] / "ingestor"
if str(INGESTOR) not in sys.path:
    sys.path.insert(0, str(INGESTOR))
