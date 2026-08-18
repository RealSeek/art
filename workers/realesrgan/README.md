# Xinyue Real-ESRGAN Worker

Optional isolated Worker for `realesrgan-x2` and `realesrgan-x4`. Upstream weights are downloaded into `/models` on first use and never committed to Git. CPU is the default; GPU deployment must use a matching CUDA/PyTorch base image and be validated by the operator.
