import os

import qrcode

# Set PUBLIC_BASE_URL on Render (e.g. https://ayurtrust-1.onrender.com) so QR codes open the live API, not localhost.
def _public_base() -> str:
    return (os.environ.get("PUBLIC_BASE_URL") or "https://ayurtrust-1.onrender.com").rstrip("/")


def generate_qr(batch_id, filename=None):

    url = f"{_public_base()}/batch/view/{batch_id}"

    if not filename:
        filename = f"{batch_id}.png"

    folder = "qr_codes"
    os.makedirs(folder, exist_ok=True)

    file_path = os.path.join(folder, filename)

    qr = qrcode.make(url)
    qr.save(file_path)

    return file_path