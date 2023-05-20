
const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

exports.handler = async (event) => {
  const { ChatGPTAPI } = await import("chatgpt");
  let api = new ChatGPTAPI({
    apiKey: process.env.CHATGPT_API,
    model: "gpt-3.5-turbo",
  });
  const tableName = process.env.TABLE_NAME;

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: process.env.ENDPOINT_URL,
  });

  console.log(`Received ${JSON.stringify(event)}`)
  const received = JSON.parse(event.body);
  const systemMessage = `You are a website builder assistant using only html and tailwind css. 
                         Respect markdown MD. don't reply words outside 1 code snippet, 
                         only show final result. Reply in languge ${received.locale || 'en'}`;

  try {
    const received = JSON.parse(event.body);
    const connectionId = event["requestContext"]["connectionId"];
    const response = await api.sendMessage(received.text, { systemMessage, parentMessageId: received.parentMessageId });
    const reply = JSON.stringify({
      text: response.text,
      parentMessageId: response.parentMessageId
    });
    console.log(`Replying ${reply}`);
    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: reply }).promise();
  } catch (e) {
    if (e.statusCode === 410) {
      console.log(`Found stale connection, deleting ${connectionId}`);
      await ddb.delete({ TableName: tableName, Key: { ConnectionId: connectionId } }).promise();
    } else {
      throw e;
    }
  }

  return { statusCode: 200, body: 'Data sent.' };
};