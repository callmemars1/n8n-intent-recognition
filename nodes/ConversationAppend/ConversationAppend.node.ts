import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError, ApplicationError } from 'n8n-workflow';

export class ConversationAppend implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			displayName: 'Conversation Append',
			name: 'conversationAppend',
			icon: 'fa:comment-dots',
			group: ['transform'],
			version: 1,
			subtitle: 'Append message to conversation history',
			defaults: {
				name: 'Conversation Append',
			},
			credentials: [
				{
					name: 'intentRecognitionApi',
					required: true,
				},
			],
			inputs: [NodeConnectionType.Main],
			outputs: [
				{
					type: NodeConnectionType.Main,
					displayName: 'Success',
				},
			],
			properties: [
				{
					displayName: 'Chat ID',
					name: 'chatId',
					type: 'string',
					default: '={{$json.chatId}}',
					description: 'The conversation ID to append the message to',
					required: true,
				},
				{
					displayName: 'Message Role',
					name: 'role',
					type: 'options',
					default: 'assistant',
					options: [
						{
							name: 'Assistant',
							value: 'assistant',
							description: 'AI assistant response',
						},
						{
							name: 'User',
							value: 'user',
							description: 'User message',
						},
						{
							name: 'System',
							value: 'system',
							description: 'System message',
						},
					],
					description: 'The role of the message sender',
					required: true,
				},
				{
					displayName: 'Message Content',
					name: 'content',
					type: 'string',
					default: '={{$json.response}}',
					description: 'The message content to append to the conversation',
					required: true,
					typeOptions: {
						rows: 4,
					},
				},
				{
					displayName: 'Options',
					name: 'options',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					options: [
						{
							displayName: 'Include Original Data',
							name: 'includeOriginalData',
							type: 'boolean',
							default: true,
							description: 'Whether to include original input data in the output',
						},
					],
				},
			],
		};
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = await this.getCredentials('intentRecognitionApi');
		
		// Validate credentials
		if (!credentials.url || !credentials.systemName || !credentials.apiKey) {
			throw new NodeOperationError(
				this.getNode(),
				`Missing credentials: url=${!!credentials.url}, systemName=${!!credentials.systemName}, apiKey=${!!credentials.apiKey}`,
				{ itemIndex: 0 }
			);
		}

		const returnData: INodeExecutionData[] = [];
		const authString = Buffer.from(`${credentials.systemName}:${credentials.apiKey}`).toString('base64');

		// Process each input item
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const item = items[itemIndex];
				const chatId = this.getNodeParameter('chatId', itemIndex) as string;
				const role = this.getNodeParameter('role', itemIndex) as string;
				const content = this.getNodeParameter('content', itemIndex) as string;
				const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

				// Validate required parameters
				if (!chatId || !content) {
					throw new NodeOperationError(
						this.getNode(),
						'Chat ID and message content are required',
						{ itemIndex }
					);
				}

				// Append message to conversation
				const appendMessageOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${credentials.url}/api/conversations/append`,
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Basic ${authString}`
					},
					body: {
						chatId: chatId,
						role: role,
						content: content
					},
					json: true,
				};

				let appendResponse: { messageId: string; chatId: string };
				try {
					appendResponse = await this.helpers.httpRequest(appendMessageOptions) as { messageId: string; chatId: string };
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to append message: ${error.message}. URL: ${credentials.url}/api/conversations/append`,
						{ itemIndex }
					);
				}

				// Create output data
				const outputData: IDataObject = {
					messageId: appendResponse.messageId,
					chatId: appendResponse.chatId,
					role: role,
					content: content,
					success: true,
					timestamp: new Date().toISOString(),
				};

				// Include original data if requested
				if (options.includeOriginalData !== false) {
					outputData.originalData = item.json;
				}

				const processedItem: INodeExecutionData = {
					json: outputData,
					pairedItem: { item: itemIndex },
				};

				// Preserve binary data
				if (item.binary) {
					processedItem.binary = item.binary;
				}

				returnData.push(processedItem);

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ 
						json: {
							...items[itemIndex].json,
							error: error.message,
							success: false,
							timestamp: new Date().toISOString(),
						}, 
						pairedItem: { item: itemIndex }
					});
				} else {
					if (error instanceof NodeOperationError) {
						throw error;
					}
					if (error instanceof ApplicationError) {
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, { itemIndex });
				}
			}
		}

		return [returnData];
	}
}