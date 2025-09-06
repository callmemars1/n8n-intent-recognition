import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeParameters,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { ApplicationError, NodeConnectionType, NodeOperationError } from 'n8n-workflow';

// Function to configure outputs based on node parameters
const configuredOutputs = (parameters: INodeParameters) => {
	const intents = ((parameters.intents as IDataObject)?.intentOptions as IDataObject[]) ?? [];

	// Create outputs for each intent
	const outputs = intents.map((intent, index) => ({
		type: 'main',
		displayName: intent.key || `Intent ${index + 1}`,
	}));

	outputs.push({
		type: 'main',
		displayName: 'Fallback',
	});

	return outputs;
};

export class IntentRecognition implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			displayName: 'Intent Recognition',
			name: 'intentRecognition',
			icon: 'file:icon.svg',
			group: ['transform'],
			version: 1,
			subtitle: `={{$parameter["intents"]?.intentOptions?.length || 0}} intents configured`,
			defaults: {
				name: 'Intent Recognition',
			},
			credentials: [
				{
					name: 'intentRecognitionApi',
					required: true,
				},
			],
			inputs: [NodeConnectionType.Main],
			// Dynamic outputs based on configuration
			outputs: `={{(${configuredOutputs})($parameter)}}`,
			properties: [
				{
					displayName: 'User Message',
					name: 'userMessage',
					type: 'string',
					default: '={{$json.message}}',
					description: 'The user message to analyze for intent recognition',
					required: true,
				},
				{
					displayName: 'Chat ID',
					name: 'chatId',
					type: 'string',
					default: '={{$json.chatId || "default-chat"}}',
					description: 'Unique identifier for the conversation',
					required: true,
				},
				{
					displayName: 'System Prompt',
					name: 'systemPrompt',
					type: 'string',
					default: 'You are a helpful intent recognition assistant. Analyze the user message and determine the most appropriate intent.',
					description: 'System prompt to guide intent recognition',
					typeOptions: {
						rows: 3,
					},
				},
				{
					displayName: 'Intents',
					name: 'intents',
					placeholder: 'Add Intent',
					type: 'fixedCollection',
					default: { 
						intentOptions: [
							{
								key: 'greeting',
								name: 'Greeting Intent',
								description: 'User greeting or hello message'
							}
						] 
					},
					typeOptions: {
						multipleValues: true,
						sortable: true,
					},
					description: 'List of intents to recognize. Each intent will create a separate output.',
					options: [
						{
							name: 'intentOptions',
							displayName: 'Intent',
							values: [
								{
									displayName: 'Intent Key',
									name: 'key',
									type: 'string',
									default: '',
									placeholder: 'e.g., greeting, booking, complaint',
									required: true,
									description: 'Unique key for the intent - will be used as output label',
								},
								{
									displayName: 'Intent Name',
									name: 'name',
									type: 'string',
									default: '',
									placeholder: 'e.g., Greeting Intent',
									required: true,
									description: 'Human-readable name for the intent',
								},
								{
									displayName: 'Description',
									name: 'description',
									type: 'string',
									default: '',
									placeholder: 'e.g., User wants to greet or say hello',
									required: true,
									description: 'Description of what this intent represents',
								},
							],
						},
					],
				},
				{
					displayName: 'Options',
					name: 'options',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					options: [
						{
							displayName: 'Generate Clarification Questions',
							name: 'generateClarification',
							type: 'boolean',
							default: true,
							description: 'Whether to generate clarification questions when no intent is recognized',
						},
					],
				}
			],
		};
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		console.log('IntentRecognition: Starting execution');
		const items = this.getInputData();
		console.log('IntentRecognition: Got input data, items:', items.length);
		
		const credentials = await this.getCredentials('intentRecognitionApi');
		console.log('IntentRecognition: Got credentials');
		
		// Debug: log credentials (excluding sensitive data)
		if (!credentials.url || !credentials.systemName || !credentials.apiKey) {
			throw new NodeOperationError(
				this.getNode(),
				`Missing credentials: url=${!!credentials.url}, systemName=${!!credentials.systemName}, apiKey=${!!credentials.apiKey}`,
				{ itemIndex: 0 }
			);
		}
		
		const intents = this.getNodeParameter('intents.intentOptions', 0, []) as Array<{
			key: string;
			name: string;
			description: string;
		}>;
		
		// Initialize return data arrays
		const numIntents = intents.length;
		const totalOutputs = numIntents + 1; // +1 for fallback
		let returnData: INodeExecutionData[][] = Array(totalOutputs).fill(0).map(() => []);
		console.log('IntentRecognition: Initialized arrays, totalOutputs:', totalOutputs);

		// Process each input item
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			console.log('IntentRecognition: Processing item', itemIndex);
			try {
				const item = items[itemIndex];
				const userMessage = this.getNodeParameter('userMessage', itemIndex) as string;
				const chatId = this.getNodeParameter('chatId', itemIndex) as string;
				const systemPrompt = this.getNodeParameter('systemPrompt', itemIndex) as string;

				// Step 1: Create settings payload
				const settingsPayload = {
					intents: intents.map(intent => ({
						key: intent.key,
						name: intent.name,
						description: intent.description
					})),
					prompt: systemPrompt
				};

				// Step 2: PUT /api/settings to get settings ID
				const authString = Buffer.from(`${credentials.systemName}:${credentials.apiKey}`).toString('base64');
				const putSettingsOptions: IHttpRequestOptions = {
					method: 'PUT',
					url: `${credentials.url}/api/settings`,
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Basic ${authString}`
					},
					body: settingsPayload,
					json: true,
				};

				let settingsResponse: { id: string };
				try {
					settingsResponse = await this.helpers.httpRequest(putSettingsOptions) as { id: string };
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to create settings: ${error.message}. URL: ${credentials.url}/api/settings`,
						{ itemIndex }
					);
				}
				const settingsId = settingsResponse.id;

				// Step 3: POST /api/conversations/append to add user message
				const appendMessageOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${credentials.url}/api/conversations/append`,
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Basic ${authString}`
					},
					body: {
						chatId: chatId,
						role: 'user',
						content: userMessage
					},
					json: true,
				};

				try {
					await this.helpers.httpRequest(appendMessageOptions);
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to append message: ${error.message}. URL: ${credentials.url}/api/conversations/append`,
						{ itemIndex }
					);
				}

				// Step 4: POST /api/settings/process to recognize intent
				const processOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${credentials.url}/api/settings/process`,
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Basic ${authString}`
					},
					body: {
						settings_id: settingsId,
						chat_id: chatId
					},
					json: true,
				};

				let processResponse: {
					intent?: string;
					clarification_message?: string;
				};
				try {
					processResponse = await this.helpers.httpRequest(processOptions) as {
						intent?: string;
						clarification_message?: string;
					};
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to process intent: ${error.message}. URL: ${credentials.url}/api/settings/process`,
						{ itemIndex }
					);
				}

				// Determine output routing
				let outputIndex: number = totalOutputs - 1; // Default to fallback
				let recognizedIntent: string | null = null;
				let clarificationMessage: string | null = null;

				if (processResponse.intent) {
					// Find the intent index
					const intentIndex = intents.findIndex(intent => intent.key === processResponse.intent);
					if (intentIndex >= 0) {
						outputIndex = intentIndex;
						recognizedIntent = processResponse.intent;
					}
				} else if (processResponse.clarification_message) {
					clarificationMessage = processResponse.clarification_message;
				}

				// Create processed item
				const processedItem: INodeExecutionData = {
					json: {
						...item.json,
						recognizedIntent,
						clarificationMessage,
						chatId,
						userMessage,
						settingsId,
						metadata: {
							processingTime: new Date().toISOString(),
							hasIntent: !!recognizedIntent,
							hasClarification: !!clarificationMessage
						}
					},
					pairedItem: { item: itemIndex },
				};

				// Preserve binary data
				if (item.binary) {
					processedItem.binary = item.binary;
				}

				// Route to appropriate output
				console.log('IntentRecognition: Routing to output', outputIndex, 'for intent:', recognizedIntent);
				returnData[outputIndex].push(processedItem);

			} catch (error) {
				if (this.continueOnFail()) {
					// Route errors to fallback output
					const errorOutputIndex = totalOutputs - 1; // Last output is fallback
					returnData[errorOutputIndex].push({ 
						json: {
							...items[itemIndex].json,
							error: error.message,
							recognizedIntent: null,
							clarificationMessage: null,
							metadata: {
								processingTime: new Date().toISOString(),
								hasError: true,
								errorMessage: error.message
							}
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

		console.log('IntentRecognition: Execution completed, returning data with', returnData.length, 'outputs');
		returnData.forEach((output, index) => {
			console.log(`IntentRecognition: Output ${index} has ${output.length} items`);
		});
		
		return returnData.length ? returnData : [[]];
	}
}
