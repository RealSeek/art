# OnlyArt IOPaint Worker

Optional isolated Worker for `iopaint-inpaint` and `iopaint-outpaint`. It implements the same authenticated, idempotent and cancellable protocol as the background-removal Worker. Models are downloaded into `/models` at runtime and are not stored in Git.

Production note: this profile is currently not release-certified. IOPaint 1.6.0 pins an older FastAPI/Pillow stack that conflicts with the patched worker baseline. Keep the profile disabled until a reviewed dependency or source compatibility update passes import, `pip check`, vulnerability and inference tests. Do not enable it merely to satisfy a route configuration.

The default CPU model is `lama`. Use `IOPAINT_MODEL` and `DEVICE` only with models and hardware verified by the operator.
