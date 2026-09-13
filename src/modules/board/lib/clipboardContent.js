import { isTauri } from '@tauri-apps/api/core';
import { Image as NativeImage } from '@tauri-apps/api/image';
import { writeHtml, writeImage, writeText } from '@tauri-apps/plugin-clipboard-manager';

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

async function imagePng(src) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('无法读取卡片图片'));
    image.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法处理卡片图片');
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('无法处理卡片图片'));
    }, 'image/png');
  });
}

export async function copyCardContent({ title = '', images = [] }) {
  if (!title.trim() && !images.length) throw new Error('卡片没有可复制的内容');
  if (!images.length) {
    if (isTauri()) await writeText(title);
    else await navigator.clipboard.writeText(title);
    return;
  }
  if (!title.trim() && images.length === 1) {
    const png = imagePng(images[0]);
    if (isTauri()) {
      const image = await NativeImage.fromBytes(new Uint8Array(await (await png).arrayBuffer()));
      try {
        await writeImage(image);
      } finally {
        await image.close();
      }
    } else {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    }
    return;
  }
  const text = title ? `<p>${escapeHtml(title).replaceAll('\n', '<br>')}</p>` : '';
  const pictures = images.map((src, index) => `<p><img src="${escapeHtml(src)}" alt="卡片图片 ${index + 1}"></p>`).join('');
  const html = `<div>${text}${pictures}</div>`;
  if (isTauri()) await writeHtml(html, title);
  else await navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([title], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' }),
  })]);
}
