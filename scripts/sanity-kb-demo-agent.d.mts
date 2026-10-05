import type {NativeDemoAdapters} from './sanity-kb-native-demo.mjs'
export function createKnowledgeBaseReader(config:{
 mcpEndpoint:string;knowledgeBaseId:string;organizationToken:string;fetchImpl?:typeof fetch
}):Pick<NativeDemoAdapters,'searchKnowledgeBase'>
