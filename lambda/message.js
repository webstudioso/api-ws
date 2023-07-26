
const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

exports.handler = async (event) => {
  const { ChatGPTAPI } = await import("chatgpt");
  let api = new ChatGPTAPI({
    apiKey: process.env.CHATGPT_API,
    completionParams: {
      model: 'gpt-3.5-turbo-0301',
      max_tokens: 3500,
      temperature: 0.8
    }
  });
  const tableName = process.env.TABLE_NAME;

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: process.env.ENDPOINT_URL,
  });

  console.log(`Received ${JSON.stringify(event)}`)
  const received = JSON.parse(event.body);
  const systemMessage = `
      Create a fully responsive landing page template using only html and tailwindcss. 
      Only use inline css within html elements and use default light theme from tailwind unless specified. 
      Do not include explanations or notes, only one code snippet. 
      Do not include additional imports except tailwindcss.
      Include real random images related to content.
      Reply in languge ${received.locale || 'en'}
  `;

  const connectionId = event["requestContext"]["connectionId"];
  console.log(`ConnectionId ${connectionId}`)
  try {
    const received = JSON.parse(event.body);
    console.log(`Received ${event.body} message parsed`)
    const response = await api.sendMessage(received.text, { systemMessage, parentMessageId: received.parentMessageId });
    const reply = JSON.stringify({
      text: response.text,
      parentMessageId: response.parentMessageId
    });
    console.log(`Replying ${reply}`);
    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: reply }).promise();
  } catch (e) {
    console.log(e)
    if (e.statusCode === 410) {
      console.log(`Found stale connection, deleting ${connectionId}`);
      await ddb.delete({ TableName: tableName, Key: { ConnectionId: connectionId } }).promise();
    } else {
      console.log(`Returning message: ${e.message}`)
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: e.message }).promise();
    }
  }

  return { statusCode: 200, body: 'Data sent.' };
};