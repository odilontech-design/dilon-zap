// A lógica de verdade mora em @dilon-zap/push — o worker precisa dela
// também (acompanhamento de contas a receber), e um app não importa de
// dentro do outro. Este arquivo só existe pra quem já importa "@/lib/push"
// não precisar mudar o caminho.
export { avisarNoCelular } from "@dilon-zap/push";
export type { AvisoPush } from "@dilon-zap/push";
