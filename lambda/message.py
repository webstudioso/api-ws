import os
import json
import boto3

client = boto3.client("apigatewaymanagementapi", endpoint_url=os.environ["ENDPOINT_URL"])
ddb = boto3.resource("dynamodb")
table = ddb.Table(os.environ("TABLE_NAME"))

def handler(event,context):
    print(event)

    # connectionIds = []
    # try:
    #     response = table.scan()
    #     items = response["Items"]
    #     print(items)
    #     for item in items:
    #         connectionIds.append(item["ConnectionId"])
    #     print(connectionIds)
    # except:
    #     pass

    # Respond to same connection
    connectionId = event["requestContext"]["connectionId"]
    response_mesage = f"Responding to: {event}"
    client.post_to_connection(Data=json.dumps(response_mesage), ConnectionId=connectionId)
    return { "statusCode": 200 }