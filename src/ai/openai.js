import OpenAI from 'openai';

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

/**
 * Extract sender name from email "From" field
 */
function extractSenderName(fromField) {
  const match = fromField.match(/^([^<]+?)\s*<?/);
  if (match && match[1]) {
    return match[1].trim().replace(/"/g, '');
  }
  const emailMatch = fromField.match(/<(.+?)>/);
  return emailMatch ? emailMatch[1].split('@')[0] : 'there';
}

/**
 * Extract company domain from email address
 */
function extractCompanyDomain(fromField) {
  const emailMatch = fromField.match(/<(.+?)>/) || fromField.match(/(.+?)$/);
  if (emailMatch) {
    const domain = emailMatch[1].split('@')[1] || '';
    return domain.replace('www.', '').split('.')[0];
  }
  return '';
}

/**
 * Build personalization details from email
 */
function buildPersonalizationDetails(email) {
  const senderName = extractSenderName(email.from);
  const companyDomain = extractCompanyDomain(email.from);

  return {
    senderName,
    companyDomain,
    subject: email.subject,
    hasCompanyEmail: email.from.includes('@'),
  };
}

/**
 * Generate personalized response using OpenAI
 */
export async function generatePersonalizedResponse(email, context) {
  try {
    const personalization = buildPersonalizationDetails(email);

    const systemPrompt = `You are a professional email assistant. Generate a warm, personalized email response.
Requirements:
- Address the sender by their name (${personalization.senderName})
- Keep the response concise (2-3 sentences)
- Be professional but friendly
- Acknowledge their email topic
- Context: ${context}`;

    const userPrompt = `Original email:
Subject: ${email.subject}
From: ${email.from}
Body: ${email.body}

Please generate a professional response that is personalized and relevant to their email.`;

    const response = await getClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    if (response.choices && response.choices.length > 0) {
      return response.choices[0].message.content;
    }

    return null;
  } catch (error) {
    console.error('Error generating response with OpenAI:', error.message);
    throw error;
  }
}

/**
 * Analyze email sentiment and category
 */
export async function analyzeEmail(email) {
  try {
    const response = await getClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Analyze this email and provide:
1. Sentiment (positive, neutral, negative)
2. Category (support, sales, feedback, meeting, other)

Email:
Subject: ${email.subject}
Body: ${email.body}

Format as JSON: {"sentiment": "...", "category": "..."}`,
        },
      ],
    });

    if (response.choices && response.choices.length > 0) {
      const analysisText = response.choices[0].message.content;
      const jsonMatch = analysisText.match(/\{.*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }

    return { sentiment: 'neutral', category: 'other' };
  } catch (error) {
    console.error('Error analyzing email:', error.message);
    return { sentiment: 'unknown', category: 'unknown' };
  }
}
