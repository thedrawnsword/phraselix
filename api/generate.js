export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { system, messages } = req.body;

  const userMessage = messages[0].content;
  const fullPrompt = system + '\n\n' + userMessage;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 1.2, maxOutputTokens: 1500 }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return res.status(500).json({ error: { message: data.error?.message || 'Gemini API error' } });
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Return in same format as Anthropic so frontend doesn't need changes
  res.status(200).json({
    content: [{ text }]
  });
}
