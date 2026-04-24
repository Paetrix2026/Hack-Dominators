import qrcode
import os

def generate_qr(batch_id, filename=None):

    url = f"http://127.0.0.1:8000/batch/view/{batch_id}"

    if not filename:
        filename = f"{batch_id}.png"

    folder = "qr_codes"
    os.makedirs(folder, exist_ok=True)

    file_path = os.path.join(folder, filename)

    qr = qrcode.make(url)
    qr.save(file_path)

    return file_path