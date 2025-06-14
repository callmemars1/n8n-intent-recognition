import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeParameters,
	INodePropertyOptions,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';
import { ApplicationError, NodeConnectionType, NodeOperationError } from 'n8n-workflow';

// Function to configure outputs based on node parameters
const configuredOutputs = (parameters: INodeParameters) => {
	const intentsList = ((parameters.intentsList as IDataObject)?.intentOptions as IDataObject[]) ?? [];
	const fallbackBehavior = parameters.fallbackBehavior as string;
	
	// Create outputs for each intent
	const outputs = intentsList.map((intent, index) => ({
		type: 'main',
		displayName: intent.key || `Intent ${index + 1}`,
	}));
	
	// Add fallback output if needed
	if (fallbackBehavior === 'route_to_fallback') {
		outputs.push({
			type: 'main',
			displayName: 'Fallback',
		});
	}
	
	return outputs.length > 0 ? outputs : [{ type: 'main', displayName: 'Main' }];
};

export class IntentRecognition implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			displayName: 'Intent Recognition',
			name: 'IntentRecognition',
			icon: 'file:icon.svg',
			group: ['transform'],
			version: 1,
			subtitle: `={{$parameter["intentsList"]?.intentOptions?.length || 0}} intents configured`,
			defaults: {
				name: 'Intent Recognition',
				color: '#4A90E2',
			},
			credentials: [
				{
					name: 'IntentRecognitionApi',
					required: true,
				},
			],
			inputs: [NodeConnectionType.Main],
			// Dynamic outputs based on configuration
			outputs: `={{(${configuredOutputs})($parameter)}}`,
			requestDefaults: {
				baseURL: 'https://api.nasa.gov',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json',
				},
			},
			properties: [
				{
					displayName: 'Intents',
					name: 'intentsList',
					placeholder: 'Add Intent',
					type: 'fixedCollection',
					default: { 
						intentOptions: [
							{
								key: 'greeting',
								description: 'User greeting or hello',
								parameters: { parameterOptions: [] }
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
									displayName: 'Intent Name',
									name: 'key',
									type: 'string',
									default: '',
									placeholder: 'e.g., greeting, booking, complaint',
									required: true,
									description: 'Name of the intent - will be used as output label',
								},
								{
									displayName: 'Description',
									name: 'description',
									type: 'string',
									default: '',
									placeholder: 'e.g., User wants to make a greeting',
									required: true,
									description: 'Description of what this intent represents',
								},
								{
									displayName: 'Keywords',
									name: 'keywords',
									type: 'string',
									default: '',
									placeholder: 'hello, hi, greetings (comma separated)',
									description: 'Keywords that trigger this intent (for simple matching)',
								},
								{
									displayName: 'Rename Output',
									name: 'renameOutput',
									type: 'boolean',
									default: false,
									description: 'Whether to customize the output name',
								},
								{
									displayName: 'Output Name',
									name: 'outputKey',
									type: 'string',
									default: '',
									description: 'Custom name for this intent output',
									displayOptions: {
										show: {
											renameOutput: [true],
										},
									},
								},
								{
									displayName: 'Parameters',
									name: 'parameters',
									type: 'fixedCollection',
									default: { parameterOptions: [] },
									typeOptions: {
										multipleValues: true,
									},
									description: 'Parameters that can be extracted for this intent',
									options: [
										{
											displayName: 'Parameter',
											name: 'parameterOptions',
											values: [
												{
													displayName: 'Parameter Name',
													name: 'key',
													type: 'string',
													default: '',
													placeholder: 'e.g., date, location, person',
													required: true,
													description: 'Name of the parameter to extract',
												},
												{
													displayName: 'Parameter Type',
													name: 'type',
													type: 'options',
													default: 'string',
													options: [
														{
															name: 'String',
															value: 'string',
														},
														{
															name: 'Number',
															value: 'number',
														},
														{
															name: 'Boolean',
															value: 'boolean',
														},
														{
															name: 'Date',
															value: 'date',
														},
													],
													description: 'Expected data type of the parameter',
												},
												{
													displayName: 'Required',
													name: 'required',
													type: 'boolean',
													default: false,
													description: 'Whether this parameter is required for the intent',
												},
												{
													displayName: 'Default Value',
													name: 'defaultValue',
													type: 'string',
													default: '',
													description: 'Default value if parameter is not found',
												}
											]
										},
									]
								},
							],
						},
					],
				},
				{
					displayName: 'Fallback Behavior',
					name: 'fallbackBehavior',
					type: 'options',
					default: 'route_to_fallback',
					options: [
						{
							name: 'Route to Fallback Output',
							value: 'route_to_fallback',
							description: 'Send unrecognized inputs to the fallback output',
						},
						{
							name: 'Discard',
							value: 'discard',
							description: 'Discard items that don\'t match any intent',
						},
						{
							name: 'Error',
							value: 'error',
							description: 'Throw an error for unrecognized inputs',
						},
					],
					description: 'How to handle input that doesn\'t match any defined intent',
				},
				{
					displayName: 'Options',
					name: 'options',
					type: 'collection',
					placeholder: 'Add option',
					default: {},
					options: [
						{
							displayName: 'Case Sensitive',
							name: 'caseSensitive',
							type: 'boolean',
							default: false,
							description: 'Whether keyword matching should be case sensitive',
						},
						{
							displayName: 'Confidence Threshold',
							name: 'confidenceThreshold',
							type: 'number',
							default: 0.5,
							typeOptions: {
								minValue: 0,
								maxValue: 1,
								numberPrecision: 2,
							},
							description: 'Minimum confidence score required for intent recognition',
						},
						{
							displayName: 'Input Field',
							name: 'inputField',
							type: 'string',
							default: 'message',
							description: 'Field name containing the text to analyze for intent',
						},
					],
				},
			],
		};
	}

	methods = {
		loadOptions: {
			async getFallbackOutputOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const intents = (this.getCurrentNodeParameter('intentsList.intentOptions') as INodeParameters[]) ?? [];

				const outputOptions: INodePropertyOptions[] = [
					{
						name: 'None (discard)',
						value: 'discard',
						description: 'Items will be discarded',
					},
					{
						name: 'Fallback Output',
						value: 'route_to_fallback',
						description: 'Items will be sent to a separate fallback output',
					},
				];

				for (const [index, intent] of intents.entries()) {
					outputOptions.push({
						name: `Intent: ${intent.outputKey || intent.key || index}`,
						value: index,
						description: `Items will be sent to the ${intent.key || 'intent'} output`,
					});
				}

				return outputOptions;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const intentsList = this.getNodeParameter('intentsList.intentOptions', 0, []) as Array<{
			key: string;
			description: string;
			keywords?: string;
			outputKey?: string;
			parameters: {
				parameterOptions: Array<{
					key: string;
					type: string;
					required: boolean;
					defaultValue: string;
				}>;
			};
		}>;
		const fallbackBehavior = this.getNodeParameter('fallbackBehavior', 0) as string;
		const options = this.getNodeParameter('options', 0, {}) as IDataObject;

		const caseSensitive = options.caseSensitive as boolean ?? false;
		const confidenceThreshold = options.confidenceThreshold as number ?? 0.5;
		const inputField = options.inputField as string ?? 'message';

		// Initialize return data arrays
		let returnData: INodeExecutionData[][] = [];
		const numIntents = intentsList.length;
		const hasFallback = fallbackBehavior === 'route_to_fallback';
		const totalOutputs = numIntents + (hasFallback ? 1 : 0);

		// Initialize output arrays
		returnData = Array(totalOutputs).fill(0).map(() => []);

		// Process each input item
		itemLoop: for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const item = items[itemIndex];
				item.pairedItem = { item: itemIndex };

				// Extract text to analyze
				let textToAnalyze = '';
				if (item.json[inputField]) {
					textToAnalyze = String(item.json[inputField]);
				} else {
					textToAnalyze = JSON.stringify(item.json);
				}

				if (!caseSensitive) {
					textToAnalyze = textToAnalyze.toLowerCase();
				}

				let recognizedIntentIndex = -1;
				let recognizedIntentKey: string | null = null;
				let extractedParameters: any = {};
				let confidence = 0;

				// Simple keyword-based intent recognition
				for (let intentIndex = 0; intentIndex < intentsList.length; intentIndex++) {
					const intent = intentsList[intentIndex];
					
					if (intent.keywords) {
						const keywords = intent.keywords.split(',').map(k => k.trim());
						const keywordMatches = keywords.filter(keyword => {
							const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
							return textToAnalyze.includes(searchKeyword);
						});

						if (keywordMatches.length > 0) {
							// Calculate simple confidence based on keyword matches
							confidence = keywordMatches.length / keywords.length;
							
							if (confidence >= confidenceThreshold) {
								recognizedIntentIndex = intentIndex;
								recognizedIntentKey = intent.key;

								// Extract parameters
								if (intent.parameters?.parameterOptions) {
									for (const param of intent.parameters.parameterOptions) {
										if (item.json.hasOwnProperty(param.key)) {
											extractedParameters[param.key] = item.json[param.key];
										} else if (param.defaultValue) {
											extractedParameters[param.key] = param.defaultValue;
										} else if (param.required) {
											// Could add validation here
										}
									}
								}
								break;
							}
						}
					}
				}

				// Determine output routing
				let outputIndex: number;
				if (recognizedIntentIndex >= 0) {
					outputIndex = recognizedIntentIndex;
				} else {
					// Handle unrecognized intent
					switch (fallbackBehavior) {
						case 'route_to_fallback':
							outputIndex = returnData.length - 1; // Last output is fallback
							break;
						case 'discard':
							continue itemLoop; // Skip this item
						case 'error':
							throw new NodeOperationError(
								this.getNode(),
								`No intent recognized for input: ${textToAnalyze.substring(0, 100)}...`,
								{ itemIndex }
							);
						default:
							if (hasFallback) {
								outputIndex = returnData.length - 1;
							} else {
								continue itemLoop;
							}
					}
				}

				// Create processed item
				const processedItem: INodeExecutionData = {
					json: {
						...item.json,
						recognizedIntent: recognizedIntentKey,
						extractedParameters,
						intentMetadata: {
							confidence,
							processingTime: new Date().toISOString(),
							inputText: textToAnalyze.substring(0, 200), // Truncated for storage
						}
					},
					pairedItem: { item: itemIndex },
				};

				// Preserve binary data
				if (item.binary) {
					processedItem.binary = item.binary;
				}

				// Route to appropriate output
				returnData[outputIndex].push(processedItem);

			} catch (error) {
				if (this.continueOnFail()) {
					// Route errors to fallback or first output
					const errorOutputIndex = hasFallback ? returnData.length - 1 : 0;
					returnData[errorOutputIndex].push({ 
						json: {
							...items[itemIndex].json,
							error: error.message,
							recognizedIntent: null,
							extractedParameters: {},
							intentMetadata: {
								confidence: 0,
								processingTime: new Date().toISOString(),
								error: true,
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

		return returnData.length ? returnData : [[]];
	}
}
