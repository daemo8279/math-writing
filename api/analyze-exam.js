/**
 * POST /api/analyze
 * Vercel Serverless Function — CommonJS 형식 (가장 안정적)
 */

/* Vercel body 파서 설정: 8MB까지 허용 */
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

module.exports.default = async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── API 키 확인 ── */
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[analyze] ANTHROPIC_API_KEY not set');
    return res.status(500).json({
      error: 'API 키가 없어요. Vercel 환경변수 ANTHROPIC_API_KEY를 확인해주세요.',
    });
  }

  /* ── 요청 데이터 검증 ── */
  const { base64, problem, mediaType = 'image/jpeg' } = req.body || {};
  if (!base64 || !problem) {
    return res.status(400).json({ error: '이미지 또는 문제 데이터가 없어요.' });
  }
  if (base64.length > 8_000_000) {
    return res.status(413).json({ error: '이미지가 너무 커요. 연습장을 지우고 다시 시도해봐요.' });
  }

  const { text = '', question = '', equation = '', blankDesc = '' } = problem;

  /* ── 프롬프트 ── */
  const SYSTEM = `너는 초등수학 전문 선생님이야. 학생이 계산 연습장에 손으로 쓴 풀이 이미지를 보고 피드백해줘.
아래 JSON 형식으로만 응답해 (백틱·설명 텍스트 없이):
{
  "recognized": "이미지에서 읽은 풀이 내용 요약 (1~2줄)",
  "status": "correct" | "wrong" | "incomplete" | "empty",
  "errors": ["오류 설명, 최대 2개"],
  "advice": "초등학생에게 주는 따뜻한 1~2문장 조언"
}
status: correct(풀이·답 모두 맞음) | wrong(실수·오류) | incomplete(미완성) | empty(내용 없음)
errors는 wrong/incomplete일 때만 포함. 반드시 한국어, 친절하게.`;

  const USER = `[문제 정보]\n문제: ${text}\n질문: ${question}\n올바른 식: ${equation}\n${blankDesc}\n\n위 이미지는 학생의 연습장이에요. 풀이를 분석하고 JSON으로 피드백해줘.`;

  /* ── Anthropic API 호출 ── */
  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: USER },
          ],
        }],
      }),
    });

    /* Anthropic 오류 처리 */
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[analyze] Anthropic API error:', apiRes.status, errText.slice(0, 300));

      if (apiRes.status === 401) {
        return res.status(502).json({ error: 'API 키가 올바르지 않아요. Vercel 환경변수를 다시 확인해주세요.' });
      }
      if (apiRes.status === 529 || apiRes.status === 503) {
        return res.status(502).json({ error: 'AI 서버가 일시적으로 바빠요. 잠시 후 다시 시도해봐요.' });
      }
      return res.status(502).json({ error: `AI 서비스 오류 (${apiRes.status})` });
    }

    /* 응답 파싱 */
    const data = await apiRes.json();
    const raw = (data.content || [])
      .map((b) => b.text || '')
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    let feedback;
    try {
      feedback = JSON.parse(raw);
    } catch (_) {
      feedback = {
        recognized: raw.slice(0, 120) || '분석 완료',
        status: 'incomplete',
        errors: [],
        advice: '풀이를 좀 더 자세히 써주면 더 정확하게 분석할 수 있어요!',
      };
    }

    return res.status(200).json(feedback);

  } catch (err) {
    console.error('[analyze] Unexpected error:', err.message);
    return res.status(500).json({
      error: `서버 오류: ${err.message || '알 수 없는 오류'}`,
    });
  }
};
