import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient } from "../lib/db";
import { evaluateText } from "../lib/moderationEngine";

const postsTableName = process.env.POSTS_TABLE_NAME ?? "Posts";

function json(statusCode: number, data: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data)
  };
}

export async function listPosts(): Promise<APIGatewayProxyStructuredResultV2> {
  const output = await docClient.send(
    new ScanCommand({
      TableName: postsTableName,
      Limit: 50
    })
  );

  return json(200, output.Items ?? []);
}

export async function createPost(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = event.body ? JSON.parse(event.body) : {};
  const userId = (body.userId ?? "anonymous") as string;
  const text = (body.text ?? "") as string;

  if (!text.trim()) {
    return json(400, { message: "Post text is required" });
  }

  const moderation = evaluateText(text);
  if (!moderation.allowed) {
    return json(422, {
      message: moderation.reason,
      code: "POLITICAL_CONTENT_BLOCKED",
      matchedTerms: moderation.matchedTerms
    });
  }

  const item = {
    postId: uuidv4(),
    userId,
    text,
    createdAt: new Date().toISOString(),
    moderationStatus: "approved"
  };

  await docClient.send(
    new PutCommand({
      TableName: postsTableName,
      Item: item
    })
  );

  return json(201, item);
}
