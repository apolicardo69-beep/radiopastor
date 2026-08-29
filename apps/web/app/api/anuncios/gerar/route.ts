import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 30;

// Mapeamento temático inteligente de imagens HD sem texto para o fundo do anúncio
const THEME_PHOTOS: Record<string, string> = {
  marcenaria: 'photo-1538688525198-9b88f6f53126', // madeira / móveis
  moveis: 'photo-1538688525198-9b88f6f53126',
  padaria: 'photo-1509440159596-0249088772ff', // pães / confeitaria
  confeitaria: 'photo-1509440159596-0249088772ff',
  restaurante: 'photo-1517248135467-4c7edcad34c4', // gastronomia
  lanchonete: 'photo-1550547660-d9450f859349', // lanches
  comida: 'photo-1517248135467-4c7edcad34c4',
  mecanica: 'photo-1486006920555-c77dce18193b', // automotivo / oficina
  oficina: 'photo-1486006920555-c77dce18193b',
  carros: 'photo-1486006920555-c77dce18193b',
  veiculos: 'photo-1486006920555-c77dce18193b',
  auto: 'photo-1486006920555-c77dce18193b',
  dentista: 'photo-1629909613654-28e377c37b09', // odontologia / saúde
  odonto: 'photo-1629909613654-28e377c37b09',
  saude: 'photo-1576091160399-112ba8d25d1d', // clínica
  clinica: 'photo-1576091160399-112ba8d25d1d',
  farmacia: 'photo-1586015555751-63bb77f4322a', // drogaria
  drogaria: 'photo-1586015555751-63bb77f4322a',
  barbearia: 'photo-1503951914875-452162b0f3f1', // barbearia / salão
  barbeiro: 'photo-1503951914875-452162b0f3f1',
  salao: 'photo-1560066984-138dadb4c035', // beleza
  estetica: 'photo-1560066984-138dadb4c035',
  beleza: 'photo-1560066984-138dadb4c035',
  construcao: 'photo-1503387762-592deb58ef4e', // construção / arquitetura
  engenharia: 'photo-1503387762-592deb58ef4e',
  arquitetura: 'photo-1503387762-592deb58ef4e',
  reforma: 'photo-1503387762-592deb58ef4e',
  tintas: 'photo-1503387762-592deb58ef4e',
  roupas: 'photo-1441986300917-64674bd600d8', // moda / boutique
  moda: 'photo-1441986300917-64674bd600d8',
  calcados: 'photo-1441986300917-64674bd600d8',
  loja: 'photo-1441986300917-64674bd600d8',
  boutique: 'photo-1441986300917-64674bd600d8',
  tecnologia: 'photo-1518770660439-4636190af475', // tecnologia / eletrônicos
  software: 'photo-1518770660439-4636190af475',
  sistemas: 'photo-1518770660439-4636190af475',
  automacao: 'photo-1518770660439-4636190af475',
  bot: 'photo-1518770660439-4636190af475',
  programacao: 'photo-1518770660439-4636190af475',
  informatica: 'photo-1518770660439-4636190af475',
  computador: 'photo-1518770660439-4636190af475',
  celular: 'photo-1511707171634-5f897ff02aa9', // celulares
  smartphones: 'photo-1511707171634-5f897ff02aa9',
  contabilidade: 'photo-1497366216548-37526070297c', // escritório executivo
  contador: 'photo-1497366216548-37526070297c',
  advocacia: 'photo-1589829545856-d10d557cf95f', // jurídico
  advogado: 'photo-1589829545856-d10d557cf95f',
  juridico: 'photo-1589829545856-d10d557cf95f',
  imobiliaria: 'photo-1560518883-ce09059eeffa', // imóveis
  imoveis: 'photo-1560518883-ce09059eeffa',
  corretor: 'photo-1560518883-ce09059eeffa',
  mercado: 'photo-1534723452862-4c874018d66d', // supermercado / mercearia
  supermercado: 'photo-1534723452862-4c874018d66d',
  mercearia: 'photo-1534723452862-4c874018d66d',
  hortifruti: 'photo-1534723452862-4c874018d66d',
  acougue: 'photo-1534723452862-4c874018d66d',
  academia: 'photo-1534438327276-14e5300c3a48', // fitness / treino
  fitness: 'photo-1534438327276-14e5300c3a48',
  treino: 'photo-1534438327276-14e5300c3a48',
  esporte: 'photo-1534438327276-14e5300c3a48',
  pet: 'photo-1587300003388-59208cc962cb', // pet shop / veterinário
  veterinaria: 'photo-1587300003388-59208cc962cb',
  gospel: 'photo-1438232992991-995b7058bbb3', // igreja / fé
  igreja: 'photo-1438232992991-995b7058bbb3',
  livraria: 'photo-1524995997946-a1c2e315a42f', // livros
  papelaria: 'photo-1524995997946-a1c2e315a42f',
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

    if (gerarImagem) {
      try {
        const photoId = escolherFotoTematica(ramo);
        const fallbackUnsplashUrl = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=800&h=450&q=80`;

        // Seed inteiro seguro para a API do Pollinations (< 2 bilhões)
        const seed = Math.floor(Math.random() * 1000000);
        const promptImg = `clean luxury modern background for ${ramo}, warm aesthetic, minimal abstract, high quality, 4k, no text, no letters, no logos, no typography`;
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
          promptImg
        )}?width=800&height=450&nologo=true&seed=${seed}`;

        // Definimos de antemão a URL de IA (ou fallback) para garantir que NUNCA fique vazio
        background_storage_path = fallbackUnsplashUrl;

        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const storageClient = serviceRoleKey
          ? createSupabaseClient(supabaseUrl, serviceRoleKey)
          : supabase;

        let imageBuffer: Buffer | null = null;
        let imageSource = 'nenhuma';

        // Tentar baixar Pollinations com timeout de 5 segundos
        try {
          console.log('[API ANUNCIOS] Tentando Pollinations com seed:', seed);
          const aiRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(5000) });
          if (aiRes.ok) {
            const arr = await aiRes.arrayBuffer();
            if (arr.byteLength > 1000) {
              imageBuffer = Buffer.from(arr);
              imageSource = 'pollinations';
              background_storage_path = pollinationsUrl;
            }
          }
        } catch (polErr) {
          console.warn('[API ANUNCIOS] Pollinations demorou ou falhou:', (polErr as Error).message);
        }

        // Se Pollinations não respondeu no tempo, tenta Unsplash rápido
        if (!imageBuffer) {
          try {
            console.log('[API ANUNCIOS] Tentando Unsplash rápido...');
            const unsplashRes = await fetch(fallbackUnsplashUrl, { signal: AbortSignal.timeout(3000) });
            if (unsplashRes.ok) {
              const arr = await unsplashRes.arrayBuffer();
              if (arr.byteLength > 1000) {
                imageBuffer = Buffer.from(arr);
                imageSource = 'unsplash';
              }
            }
          } catch (unsplashErr) {
            console.warn('[API ANUNCIOS] Erro Unsplash:', unsplashErr);
          }
        }

        // Se conseguimos o buffer, tenta salvar no Storage Supabase
        if (imageBuffer) {
          try {
            const filename = `arte-ia-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.jpg`;
            const { error: uploadErr } = await storageClient.storage
              .from('patrocinadores')
              .upload(filename, imageBuffer, {
                contentType: 'image/jpeg',
                upsert: true,
              });

            if (!uploadErr) {
              background_storage_path = filename;
              console.log('[API ANUNCIOS] ✅ Salvo no Storage Supabase:', filename);
            } else {
              console.warn('[API ANUNCIOS] Upload no storage falhou, mantendo URL direta:', uploadErr.message);
            }
          } catch (storageErr) {
            console.warn('[API ANUNCIOS] Erro ao salvar no storage:', storageErr);
          }
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
