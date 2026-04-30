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

  // ── 시스템 프롬프트 (JSON 템플릿에 한국어 섞지 않음) ──
  const SYSTEM = [
    '너는 초등수학 전문 선생님이야.',
    isImage
      ? '학생이 손으로 쓴 풀이 이미지를 받을 거야. 손글씨를 읽고 채점해줘.'
      : '학생의 서술형 답안 텍스트를 채점해줘.',
    '',
    '아래 JSON 형식으로만 응답해. 백틱이나 설명 텍스트는 절대 쓰지 마.',
    '모든 숫자 필드는 반드시 숫자(integer)여야 해. 문자열로 쓰면 안 돼.',
    '',
    '{"recognized":"풀이 내용 요약","score":75,"accuracy":80,"process":70,"expression":60,"feedback":"피드백 2~3문장","modelAnswer":"모범 답안 2~4문장"}',
    '',
    '각 필드 설명:',
    '- recognized: ' + (isImage ? '이미지에서 읽은 손글씨 내용 요약' : '학생이 쓴 답안 요약'),
    '- score: 종합 점수 0~100 정수',
    '- accuracy: 정확성(계산·답이 맞는지) 0~100 정수',
    '- process: 풀이과정(단계별로 논리적인지) 0~100 정수',
    '- expression: 표현력(문장 설명이 잘 됐는지) 0~100 정수',
    '- feedback: 잘한 점 먼저, 개선점은 뒤에, 초등학생 눈높이로',
    '- modelAnswer: 완전한 모범 답안 (식 + 문장)',
    '',
    '채점 기준: score = round(accuracy×0.4 + process×0.4 + expression×0.2)',
    '답이 완전히 맞으면 accuracy 90 이상, 식을 세우고 단계별로 풀었으면 process 80 이상.',
  ].join('\n');

  const userText = [
    '[문제 정보]',
    `상황: ${text}`,
    `질문: ${question}`,
    `올바른 식과 답: ${equation} (정답: ${answer})`,
    '',
    isImage
      ? '위 이미지에 손으로 쓴 풀이를 채점해줘.'
      : `[학생 답안]\n${studentAnswer}\n\n위 답안을 채점해줘.`,
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
    console.log('[grade] raw response:', rawText.slice(0, 300));

    const clean = rawText.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch (parseErr) {
      console.error('[grade] JSON parse error:', parseErr.message, '| raw:', clean.slice(0, 200));
      // JSON 파싱 실패 시 안전한 기본값
      result = {
        recognized: isImage ? '손글씨를 인식했어요.' : studentAnswer?.slice(0, 80) || '',
        score: 50, accuracy: 50, process: 50, expression: 50,
        feedback: '채점을 완료했어요! 풀이 과정을 더 자세히 쓰면 더 높은 점수를 받을 수 있어요.',
        modelAnswer: `${equation}`,
      };
    }

    // 숫자 정규화 (문자열로 왔을 경우 대비)
    const acc = Math.min(100, Math.max(0, parseInt(result.accuracy, 10) || 0));
    const prc = Math.min(100, Math.max(0, parseInt(result.process,  10) || 0));
    const exp = Math.min(100, Math.max(0, parseInt(result.expression,10) || 0));

    result.accuracy   = acc;
    result.process    = prc;
    result.expression = exp;
    result.score      = Math.round(acc * 0.4 + prc * 0.4 + exp * 0.2);

    console.log('[grade] final scores — score:', result.score, 'acc:', acc, 'prc:', prc, 'exp:', exp);

    return res.status(200).json(result);

  } catch (err) {
    console.error('[grade] unexpected error:', err.message);
    return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
}

handler.config = { api: { bodyParser: { sizeLimit: '8mb' } } };
module.exports = handler;
