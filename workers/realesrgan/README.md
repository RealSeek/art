# OnlyArt Real-ESRGAN Worker

Optional isolated Worker for `realesrgan-x2` and `realesrgan-x4`. Upstream weights are downloaded into `/models` on first use and never committed to Git. CPU is the default; GPU deployment must use a matching CUDA/PyTorch base image and be validated by the operator.

Production note: this profile is currently not release-certified. The pinned BasicSR/Real-ESRGAN stack imports a removed torchvision module on the current supported PyTorch image and has an upstream security advisory. Keep it disabled until a reviewed compatibility fork and vulnerability scan pass in isolated staging.
