// Utilitários para detecção e integração com o YouTube
// Suporta URLs de formato:
// - https://www.youtube.com/watch?v=VIDEO_ID
// - https://youtu.be/VIDEO_ID
// - https://m.youtube.com/watch?v=VIDEO_ID
// - https://www.youtube.com/shorts/VIDEO_ID
// - https://www.youtube.com/embed/VIDEO_ID
// - https://music.youtube.com/watch?v=VIDEO_ID

export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Padrão regex universal para links do YouTube
  const regExp =
    /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/;
  const match = trimmed.match(regExp);
  if (match && match[1]) {
    return match[1];
  }

  // Tenta analisar via URL query param se houver
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      const v = parsed.searchParams.get('v');
      if (v && v.length === 11) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last.length === 11) return last;
    }
  } catch {}

  return null;
}

export function isYouTubeUrl(url?: string | null): boolean {
  if (!url) return false;
  return extractYouTubeVideoId(url) !== null;
}

export function getYouTubeThumbnail(videoIdOrUrl: string): string {
  const id = extractYouTubeVideoId(videoIdOrUrl) || videoIdOrUrl;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

export async function fetchYouTubeInfo(url: string): Promise<{
  title: string | null;
  author: string | null;
  thumbnail: string | null;
}> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return { title: null, author: null, thumbnail: null };
  }

  const thumb = getYouTubeThumbnail(videoId);

  try {
    // Consulta o oEmbed oficial e público do YouTube (sem necessidade de API key e sem bloqueio CORS)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || null,
        author: data.author_name || null,
        thumbnail: data.thumbnail_url || thumb,
      };
    }
  } catch (err) {
    console.warn('Erro ao consultar oEmbed do YouTube:', err);
  }

  return {
    title: null,
    author: null,
    thumbnail: thumb,
  };
}
