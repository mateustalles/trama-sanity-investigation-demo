import {handleSanityGameAction} from '../../../../../../lib/sanity-game-handler'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const POST=(request:Request)=>handleSanityGameAction(request,'review')
