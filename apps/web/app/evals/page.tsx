import { EvalWorkbench } from "./eval-workbench";
import { actionEvalSamples } from "./samples";
import { expandedActionEvalSamples } from "./expanded-samples";

export default function EvalsPage() { return <EvalWorkbench samples={[...actionEvalSamples, ...expandedActionEvalSamples]} />; }
