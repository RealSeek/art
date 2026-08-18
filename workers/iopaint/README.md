# Xinyue IOPaint Worker

Optional isolated Worker for `iopaint-inpaint` and `iopaint-outpaint`. It implements the same authenticated, idempotent and cancellable protocol as the background-removal Worker. Models are downloaded into `/models` at runtime and are not stored in Git.

The default CPU model is `lama`. Use `IOPAINT_MODEL` and `DEVICE` only with models and hardware verified by the operator.
