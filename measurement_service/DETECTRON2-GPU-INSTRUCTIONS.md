```markdown
Detectron2 GPU Dockerfile notes (summary)
1. Choose a CUDA base image that matches available drivers, e.g.:
   FROM nvidia/cuda:11.7.1-cudnn8-runtime-ubuntu20.04

2. Install system deps, python, pip, then install torch & torchvision matching CUDA:
   pip install torch==<version>+cu117 torchvision==<version>+cu117 -f https://download.pytorch.org/whl/cu117/torch_stable.html

3. Install detectron2 wheel compatible with your torch+CUDA:
   pip install detectron2 -f https://dl.fbaipublicfiles.com/detectron2/wheels/cu117/torch1.13/index.html
   (Adjust URLs per torch/cuda versions; see Detectron2 docs.)

4. Copy app code, install other requirements, then run uvicorn.
5. Use NVIDIA runtime when running container:
   docker run --gpus all --rm -p 8000:8000 ... measurement-service:gpu