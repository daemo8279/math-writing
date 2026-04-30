/* Vercel body 파서 설정 */
module.exports.config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API 키가 없어요. Vercel 환경변수 ANTHROPIC_API_KEY를 확인해주세요.' });
  }

  const { base64, problem, mediaType = 'image/jpeg' } = req.body || {};
  if (!base64 || !problem) return res.status(400).json({ error: '데이터가 없어요.' });
  if (base64.length > 8_000_000) return res.status(413).json({ error: '이미지가 너무 커요.' });

  const { text = '', question = '', equation = '', blankDesc = '' } = problem;

  const SYSTEM = `너는 초등수학 전문 선생님이야. 학생이 계산 연습장에 손으로 쓴 풀이 이미지를 보고 피드백해줘.
아래 JSON 형식으로만 응답해 (백틱·설명 텍스트 없이):
{"recognized":"풀이 내용 요약","status":"correct"|"wrong"|"incomplete"|"empty","errors":["오류 설명 최대 2개"],"advice":"따뜻한 조언 1~2문장"}
status: correct(모두 맞음) | wrong(실수·오류) | incomplete(미완성) | empty(내용 없음)
errors는 wrong/incomplete일 때만. 한국어, 친절하게.`;

  const USER = `[문제]\n${text}\n질문: ${question}\n올바른 식: ${equation}\n${blankDesc}\n\n이미지의 풀이를 분석하고 JSON으로 피드백해줘.`;

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
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: USER },
        ]}],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[analyze]', apiRes.status, errText.slice(0, 200));
      if (apiRes.status === 401) return res.status(502).json({ error: 'API 키가 잘못됐어요. Vercel 환경변수를 확인해주세요.' });
      return res.status(502).json({ error: `AI 오류 (${apiRes.status})` });
    }

    const data = await apiRes.json();
    const raw = (data.content || []).map(b => b.text || '').join('').replace(/```json|```/g, '').trim();

    let feedback;
    try { feedback = JSON.parse(raw); }
    catch (_) { feedback = { recognized: raw.slice(0, 100), status: 'incomplete', errors: [], advice: '풀이를 더 자세히 써주세요!' }; }

    return res.status(200).json(feedback);

  } catch (err) {
    console.error('[analyze] error:', err.message);
    return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
};
