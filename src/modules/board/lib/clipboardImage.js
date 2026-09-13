import { isTauri } from '@tauri-apps/api/core';
import { readImage } from '@tauri-apps/plugin-clipboard-manager';

const MAX_EDGE = 960;
const JPEG_QUALITY = 0.8;
export const MAX_CARD_IMAGES = 4;

export function imageFilesFromClipboard(event) {
  const data = event.clipboardData || event.dataTransfer;
  if (!data) return [];
  const files = [];
  if (data.files?.length) {
    for (const file of data.files) {
      if (file.type.startsWith('image/')) files.push(file);
    }
  }
  if (!files.length && data.items) {
    for (const item of data.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  return files;
}

function compressImage(source) {
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法处理图片');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        resolve(compressImage(image));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('无法读取图片'));
    };
    image.src = objectUrl;
  });
}

async function nativeClipboardImage() {
  const image = await readImage();
  try {
    const [{ width, height }, rgba] = await Promise.all([image.size(), image.rgba()]);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理图片');
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    return compressImage(canvas);
  } finally {
    await image.close();
  }
}

export async function imagesFromClipboardEvent(event, remaining = MAX_CARD_IMAGES) {
  const files = imageFilesFromClipboard(event);
  const data = event.clipboardData;
  const readNative = data && isTauri()
    && !Array.from(data.types || []).some(type => type.startsWith('text/'));
  if (!files.length && !readNative) return [];
  event.preventDefault();
  if (remaining <= 0) throw new Error(`每张卡片最多添加 ${MAX_CARD_IMAGES} 张图片`);
  if (files.length) return Promise.all(files.slice(0, remaining).map(compressImageFile));
  try {
    return [await nativeClipboardImage()];
  } catch {
    throw new Error('图片读取失败，请重新复制图片后再试');
  }
}
