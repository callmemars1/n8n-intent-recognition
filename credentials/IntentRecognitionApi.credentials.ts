import {
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class IntentRecognitionApi implements ICredentialType {
	name = 'intentRecognitionApi';
	displayName = 'Intent Recognition API';

	documentationUrl = 'https://intents.smartynov.com';

	properties: INodeProperties[] = [
		{
			displayName: 'URL',
			name: 'url',
			type: 'string',
			default: 'https://intents.smartynov.com',
			description: 'The base URL of the Intent Recognition API',
		},
		{
			displayName: 'Project System Name',
			name: 'systemName',
			type: 'string',
			default: '',
			required: true,
			description: 'The project system name for authentication',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'The API key for authentication',
		},
	];

	// The block below tells how this credential can be tested
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url}}',
			url: '/api/authcheck',
			method: 'GET',
			headers: {
				'Authorization': '=Basic {{Buffer.from($credentials.systemName + ":" + $credentials.apiKey).toString("base64")}}',
			},
		},
	};
}