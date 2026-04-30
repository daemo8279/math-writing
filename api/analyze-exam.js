/**
 * POST /api/analyze
 * 연습장 이미지를 Claude Vision으로 분석해 풀이 피드백 반환
 *
 * Body: { base64: string, problem: { text, question, equation, blankDesc, answer, result } }
 * Response: { recognized, status, errors[], advice }
 */
export default async function handler(req, res) {
  /* CORS (로컬 개발 대응) */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* API 키 확인 */
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[analyze] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'API 키가 설정되지 않았어요. 관리자에게 문의해주세요.' });
  }

  /* 요청 바디 파싱 */
  const { base64, problem } = req.body || {};
  if (!base64 || !problem) {
    return res.status(400).json({ error: '필수 데이터가 없어요.' });
  }

  const { text = '', question = '', equation = '', blankDesc = '' } = problem;

  /* 프롬프트 구성 */
  const SYSTEM = `너는 초등수학 전문 선생님이야. 학생이 계산 연습장에 손으로 쓴 풀이 이미지를 보고 피드백해줘.

아래 JSON 형식으로만 응답해 (백틱·설명 텍스트 없이):
{
  "recognized": "이미지에서 읽은 풀이 내용 요약 (1~2줄, 읽기 어려우면 '글씨를 알아보기 어려워요')",
  "status": "correct" | "wrong" | "incomplete" | "empty",
  "errors": ["오류 설명 (틀린 단계마다 1개씩, 최대 2개)"],
  "advice": "초등학생에게 주는 따뜻한 1~2문장 조언"
}

status 기준:
- correct : 풀이 과정과 최종 답이 모두 맞음
- wrong   : 계산 실수, 개념 오류, 또는 최종 답이 틀림
- incomplete : 풀이가 중간에 끊기거나 답을 구하지 않음
- empty   : 내용이 없거나 식별 불가

errors는 wrong/incomplete일 때만 포함. 반드시 한국어로, 친절하게 써줘.`;

  const USER = `[문제 정보]
문제 상황: ${text}
질문: ${question}
올바른 식: ${equation}
${blankDesc}

위 이미지는 학생의 연습장이에요. 이 문제를 어떻게 풀었는지 분석하고 JSON으로 피드백해줘.`;

  /* Anthropic API 호출 */
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
              source: { type: 'base64', media_type: 'image/png', data: base64 },
            },
            { type: 'text', text: USER },
          ],
        }],
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error('[analyze] Anthropic API error:', apiRes.status, errBody);
      return res.status(502).json({ error: `AI 서비스 오류 (${apiRes.status})` });
    }

    const data = await apiRes.json();
    const raw = (data.content || [])
      .map(b => b.text || '')
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    let feedback;
    try {
      feedback = JSON.parse(raw);
    } catch (e) {
      // JSON 파싱 실패 시 fallback
      feedback = {
        recognized: raw.slice(0, 100) || '분석을 완료했어요.',
        status: 'incomplete',
        errors: [],
        advice: '풀이 과정을 좀 더 자세히 써주면 더 정확하게 분석할 수 있어요!',
      };
    }

    return res.status(200).json(feedback);

  } catch (err) {
    console.error('[analyze] Unexpected error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.' });
  }
}
