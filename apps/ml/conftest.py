# Put the ingestor on sys.path before any test module imports `src.*`, so the
# order of imports in tests doesn't matter.
import trackflights_ml  # noqa: F401
