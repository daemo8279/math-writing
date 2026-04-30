async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API 키가 없어요.' });

  const { problem, studentAnswer, base64, mediaType = 'image/jpeg' } = req.body || {};
  if (!problem) return res.status(400).json({ error: '문제 데이터가 없어요.' });
  if (!studentAnswer && !base64) return res.status(400).json({ error: '답안 데이터가 없어요.' });

  const { text = '', question = '', equation = '', answer = '' } = problem;
  const isImage = !!base64;

  const SYSTEM = `너는 초등학생의 수학 서술형 답안을 채점하는 선생님이야.
${isImage ? '학생이 손으로 쓴 풀이 이미지야. 손글씨를 읽고 채점해줘.' : ''}

채점할 때 아래 기준을 반드시 따라줘:

[정확성 accuracy 채점 기준 — 가장 중요]
- 최종 답의 숫자가 정답과 일치하면 accuracy 85 이상을 줘
- 식은 틀렸지만 답이 맞으면 accuracy 70
- 답이 없거나 완전히 틀리면 accuracy 30 이하

[풀이과정 process 채점 기준]
- 계산식을 쓰고 과정을 설명했으면 process 80 이상
- 답만 썼으면 process 40
- 아무것도 없으면 process 10

[표현력 expression 채점 기준]
- 문장으로 답을 설명했으면 expression 80 이상
- 숫자만 썼으면 expression 40

[중요] 초등학생 답안이라서 맞춤법이 틀리거나 식 표현이 서툴러도 관대하게 봐줘.
답의 숫자가 맞으면 무조건 accuracy를 높게 줘야 해.

아래 JSON 형식으로만 응답해. 백틱 없이. 모든 점수는 정수.

{"recognized":"답안 요약","score":75,"accuracy":85,"process":70,"expression":60,"feedback":"피드백","modelAnswer":"모범답안"}`;

  const userText = [
    `[문제] ${text}`,
    `[질문] ${question}`,
    `[정답] ${answer} (식: ${equation})`,
    '',
    isImage
      ? '위 이미지의 손글씨 풀이를 채점해줘.'
      : `[학생 답안]\n${studentAnswer}`,
  ].join('\n');

  const content = isImage
    ? [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: userText },
      ]
    : [{ type: 'text', text: userText }];

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
        max_tokens: 800,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[grade]', apiRes.status, errText.slice(0, 300));
      if (apiRes.status === 401) return res.status(502).json({ error: 'API 키가 잘못됐어요.' });
      return res.status(502).json({ error: `AI 오류 (${apiRes.status})` });
    }

    const data = await apiRes.json();
    const rawText = (data.content || []).map(b => b.text || '').join('');
    console.log('[grade] raw:', rawText.slice(0, 400));

    let result;
    try {
      result = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error('[grade] parse error:', e.message);
      result = {
        recognized: studentAnswer?.slice(0, 80) || '손글씨 인식 완료',
        score: 50, accuracy: 50, process: 50, expression: 50,
        feedback: '풀이를 확인했어요! 다음엔 풀이 과정을 단계별로 써봐요.',
        modelAnswer: `${equation}이므로 답은 ${answer}입니다.`,
      };
    }

    // 점수 정규화
    const acc = Math.min(100, Math.max(0, parseInt(result.accuracy, 10) || 0));
    const prc = Math.min(100, Math.max(0, parseInt(result.process,  10) || 0));
    const exp = Math.min(100, Math.max(0, parseInt(result.expression, 10) || 0));
    result.accuracy   = acc;
    result.process    = prc;
    result.expression = exp;
    result.score      = Math.round(acc * 0.4 + prc * 0.4 + exp * 0.2);

    console.log('[grade] scores — score:', result.score, 'acc:', acc, 'prc:', prc, 'exp:', exp);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[grade] error:', err.message);
    return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
}

handler.config = { api: { bodyParser: { sizeLimit: '8mb' } } };
module.exports = handler;
