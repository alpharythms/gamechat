const fetch = require('node-fetch');
require('dotenv').config();

const VENICE_API_KEY = process.env.VENICE_API_KEY;
if (!VENICE_API_KEY) {
  console.error('VENICE_API_KEY is not set in .env file');
  process.exit(1);
}
const VENICE_TEXT_API_ENDPOINT = 'https://api.venice.ai/api/v1/chat/completions';

async function testCharacterAPI() {
  console.log('Testing Venice Character API...');
  
  const data = {
    model: 'default',
    messages: [
      {
        role: 'user',
        content: 'Introduce yourself'
      }
    ],
    venice_parameters: {
      character_slug: 'our-strange-loop'
    },
    stream: true
  };

  try {
    console.log('Making request with data:', JSON.stringify(data, null, 2));
    
    const response = await fetch(VENICE_TEXT_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VENICE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('API error:', error);
      throw new Error(`Venice API error: ${error}`);
    }

    // Get the raw response text
    const text = await response.text();
    console.log('\nRaw response:', text);

    // Process each line
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.choices?.[0]?.delta?.content) {
            process.stdout.write(data.choices[0].delta.content);
          }
        } catch (e) {
          // Ignore end-of-stream data
          if (!line.includes('[DONE]')) {
            console.error('Error parsing JSON:', e, 'Line:', line);
          }
        }
      }
    }
    console.log('\nTest completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testCharacterAPI();
