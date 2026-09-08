/** Resize/compress a profile image to a JPEG data URL suitable for API storage. */
export async function compressAvatarFile(file: File): Promise<string> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await loadImage(objectUrl);
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("canvas_unavailable");
        }
        ctx.drawImage(image, 0, 0, width, height);
        let quality = 0.85;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 220_000 && quality > 0.45) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        return dataUrl;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image_load_failed"));
        image.src = src;
    });
}
