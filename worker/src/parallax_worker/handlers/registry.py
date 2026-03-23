"""Registry mapping modality strings to their handler instances."""

from parallax_worker.handlers.img2img import Img2ImgHandler
from parallax_worker.handlers.img2vid import Img2VidHandler
from parallax_worker.handlers.txt2audio import Txt2AudioHandler
from parallax_worker.handlers.txt2img import Txt2ImgHandler
from parallax_worker.handlers.txt2vid import Txt2VidHandler
from parallax_worker.handlers.upscale import UpscaleHandler

REGISTRY: dict = {
    "txt2img": Txt2ImgHandler(),
    "img2img": Img2ImgHandler(),
    "upscale": UpscaleHandler(),
    "txt2vid": Txt2VidHandler(),
    "img2vid": Img2VidHandler(),
    "txt2audio": Txt2AudioHandler(),
}
