import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Mapeamento temático inteligente de imagens HD sem texto para o fundo do anúncio
const THEME_PHOTOS: Record<string, string> = {
  marcenaria: 'photo-1538688525198-9b88f6f53126', // madeira / móveis
  moveis: 'photo-1538688525198-9b88f6f53126',
  padaria: 'photo-1509440159596-0249088772ff', // pães / confeitaria
  confeitaria: 'photo-1509440159596-0249088772ff',
  restaurante: 'photo-1517248135467-4c7edcad34c4', // gastronomia
  lanchonete: 'photo-1550547660-d9450f859349', // lanches
  mecanica: 'photo-1486006920555-c77dce18193b', // automotivo / oficina
  carros: 'photo-1486006920555-c77dce18193b',
  dentista: 'photo-1629909613654-28e377c37b09', // odontologia / saúde
  saude: 'photo-1576091160399-112ba8d25d1d', // clínica
  farmacia: 'photo-1586015555751-63bb77f4322a', // drogaria
  barbearia: 'photo-1503951914875-452162b0f3f1', // barbearia / salão
  salao: 'photo-1560066984-138dadb4c035', // beleza
  construcao: 'photo-1503387762-592deb58ef4e', // construção / arquitetura
  engenharia: 'photo-1503387762-592deb58ef4e',
  roupas: 'photo-1441986300917-64674bd600d8', // moda / boutique
  moda: 'photo-1441986300917-64674bd600d8',
  tecnologia: 'photo-1518770660439-4636190af475', // tecnologia / eletrônicos
  celular: 'photo-1511707171634-5f897ff02aa9', // celulares
  contabilidade: 'photo-1497366216548-37526070297c', // escritório executivo
  advocacia: 'photo-1589829545856-d10d557cf95f', // jurídico
  imobiliaria: 'photo-1560518883-ce09059eeffa', // imóveis
  gospel: 'photo-1438232992991-995b7058bbb3', // igreja / fé
  default: 'photo-1557683316-973673baf926', // gradiente dourado quente sofisticado
};

function escolherFotoTematica(ramo: string): string {
  const normalizado = ramo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const [chave, photoId] of Object.entries(THEME_PHOTOS)) {
    if (normalizado.includes(chave)) {
      return photoId;
    }
  }
  return THEME_PHOTOS.default;
}

// Fallback para gerar chamadas publicitárias inteligentes
function gerarChamadasLocais(nome: string, ramo: string, detalhes?: string): string[] {
  const comp = detalhes ? ` (${detalhes})` : '';
  return [
    `${nome}: Qualidade, confiança e excelência em ${ramo}${comp}. Fale conosco!`,
    `${nome} apoia a programação da Rádio Graça & Paz. Sua melhor escolha em ${ramo}!`,
    `${nome} — Tradição e o melhor atendimento em ${ramo}. Faça seu orçamento pelo WhatsApp!`,
    `${nome}: Referência em ${ramo}. Fazendo sempre o melhor por você e sua família!`,
  ];
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Permitir requisição autenticada
    if (!user) {
      return NextResponse.json({ erro: 'Não autorizado. Faça login no Estúdio.' }, { status: 401 });
    }

    const body = await req.json();
    const { nome, ramo, detalhes, gerarImagem } = body;

    if (!nome || !ramo) {
      return NextResponse.json(
        { erro: 'Informe o nome e o ramo do patrocinador.' },
        { status: 400 }
      );
    }

    let chamadas: string[] = [];
    let aviso: string | null = null;

    // 1. Geração de Slogans / Chamadas com IA (Gemini ou OpenAI)
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      try {
        const prompt = `Você é um redator publicitário de uma rádio evangélica comunitária. Crie 4 chamadas/slogans curtos, diretos e impactantes para um patrocinador/anunciante.
Nome do negócio: "${nome}"
Ramo de atividade: "${ramo}"
Detalhes adicionais: "${detalhes || 'Nenhum'}"

Regras:
- Cada chamada deve ter no máximo 140 caracteres.
- Devem ser adequadas para rádio evangélica/família.
- Retorne APENAS um JSON no formato: ["frase 1", "frase 2", "frase 3", "frase 4"] sem blocos markdown adicionais.`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
            signal: AbortSignal.timeout(6000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed) && parsed.length > 0) {
              chamadas = parsed.map((s) => String(s).trim());
            }
          }
        }
      } catch (err) {
        console.error('[API ANUNCIOS] Erro Gemini:', err);
      }
    } else if (openAiKey) {
      try {
        const prompt = `Crie 4 chamadas publicitárias curtas (máximo 140 caracteres cada) para o anunciante "${nome}", do ramo "${ramo}". Detalhes: "${detalhes || ''}". Retorne apenas um JSON array de strings: ["frase 1", "frase 2", "frase 3", "frase 4"]`;

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content?.trim();
          if (content) {
            const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) {
              chamadas = parsed.map((s) => String(s).trim());
            }
          }
        }
      } catch (err) {
        console.error('[API ANUNCIOS] Erro OpenAI:', err);
      }
    }

    // Fallback inteligente caso a IA não tenha retornado
    if (!chamadas || chamadas.length === 0) {
      chamadas = gerarChamadasLocais(nome, ramo, detalhes);
    }

    // 2. Geração da Arte de Fundo com IA e Fallback Ultrarrápido HD
    let background_storage_path: string | null = null;
    // URL direta (usada como último recurso caso o upload no Storage falhe)
    let background_direct_url: string | null = null;

    if (gerarImagem) {
      try {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

        console.log('[API ANUNCIOS] service_role configurada:', !!serviceRoleKey);

        const storageClient = serviceRoleKey
          ? createSupabaseClient(supabaseUrl, serviceRoleKey)
          : supabase;

        let imageBuffer: Buffer | null = null;
        let imageSource = 'nenhuma';

        // Opção A: Tentar gerar via IA com timeout generoso (8s)
        try {
          const promptImg = `clean elegant background texture for ${ramo}, warm aesthetic, minimal abstract, high quality, 4k, no text, no letters, no logos, no typography`;
          const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            promptImg
          )}?width=800&height=450&nologo=true&seed=${Date.now()}`;

          console.log('[API ANUNCIOS] Tentando Pollinations...');
          const aiRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(8000) });
          if (aiRes.ok) {
            const arr = await aiRes.arrayBuffer();
            console.log('[API ANUNCIOS] Pollinations respondeu, tamanho:', arr.byteLength);
            if (arr.byteLength > 1000) {
              imageBuffer = Buffer.from(arr);
              imageSource = 'pollinations';
            }
          } else {
            console.warn('[API ANUNCIOS] Pollinations retornou status:', aiRes.status);
          }
        } catch (polErr) {
          console.warn('[API ANUNCIOS] Pollinations timeout/erro:', (polErr as Error).message);
        }

        // Opção B: Fallback Temático HD Instantâneo (< 1s)
        const photoId = escolherFotoTematica(ramo);
        const fallbackUrl = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=800&h=450&q=80`;

        if (!imageBuffer) {
          try {
            console.log('[API ANUNCIOS] Usando fallback Unsplash, photoId:', photoId);
            const unsplashRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(5000) });
            if (unsplashRes.ok) {
              const arr = await unsplashRes.arrayBuffer();
              console.log('[API ANUNCIOS] Unsplash respondeu, tamanho:', arr.byteLength);
              if (arr.byteLength > 1000) {
                imageBuffer = Buffer.from(arr);
                imageSource = 'unsplash';
              }
            } else {
              console.warn('[API ANUNCIOS] Unsplash retornou status:', unsplashRes.status);
            }
          } catch (unsplashErr) {
            console.error('[API ANUNCIOS] Erro Unsplash:', unsplashErr);
          }
        }

        // Guardar a URL direta do Unsplash como último recurso
        background_direct_url = fallbackUrl;

        // Salvar a imagem no Storage Supabase
        if (imageBuffer) {
          const filename = `arte-ia-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.jpg`;
          console.log('[API ANUNCIOS] Fazendo upload no Storage, fonte:', imageSource, ', arquivo:', filename);

          const { error: uploadErr } = await storageClient.storage
            .from('patrocinadores')
            .upload(filename, imageBuffer, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (!uploadErr) {
            background_storage_path = filename;
            console.log('[API ANUNCIOS] ✅ Upload OK:', filename);
          } else {
            console.error('[API ANUNCIOS] ❌ Erro ao salvar imagem no Storage:', uploadErr);
            // Fallback: usar URL direta para que o card não fique sem arte
            if (background_direct_url) {
              background_storage_path = background_direct_url;
              console.log('[API ANUNCIOS] Usando URL direta como fallback:', background_direct_url);
            }
            aviso = 'Chamadas criadas! A arte de fundo usa uma imagem externa. Configure SUPABASE_SERVICE_ROLE_KEY na Vercel para salvar no Storage.';
          }
        } else {
          console.warn('[API ANUNCIOS] Nenhuma imagem obtida (Pollinations e Unsplash falharam)');
        }
      } catch (imgErr) {
        console.error('[API ANUNCIOS] Erro geral ao processar imagem:', imgErr);
      }
    }

    return NextResponse.json({
      chamadas,
      background_storage_path,
      aviso,
    });
  } catch (err: unknown) {
    console.error('[API ANUNCIOS] Erro fatal:', err);
    return NextResponse.json(
      { erro: 'Ocorreu um erro interno ao processar o anúncio com IA.' },
      { status: 500 }
    );
  }
}
