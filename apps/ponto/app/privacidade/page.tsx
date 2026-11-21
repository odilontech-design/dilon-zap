import type { Metadata } from "next";
import { DocumentoLegal } from "@/components/documento-legal";

export const metadata: Metadata = { title: "Política de Privacidade — Dilon Ponto" };

/**
 * Privacidade do Dilon Ponto (LGPD, Lei 13.709/2018). Papéis: a empresa
 * cliente é a CONTROLADORA dos dados dos seus colaboradores; a Dilon Tech é a
 * OPERADORA, que trata esses dados para prestar o serviço, conforme as
 * instruções da empresa. Para os dados do próprio administrador (cadastro e
 * cobrança), a Dilon Tech é controladora.
 */
const SECOES = [
  {
    titulo: "1. Quem somos e qual o nosso papel",
    texto:
      "O Dilon Ponto é um sistema de controle de ponto da Dilon Tech (CNPJ 64.601.665/0001-33), com sede na Avenida Brasil, 115, Vila São Luis, Duque de Caxias/RJ.\nA empresa que contrata o Dilon Ponto é a controladora dos dados dos seus colaboradores: é ela quem decide quem bate ponto e para quê. A Dilon Tech é a operadora desses dados e só os trata para prestar o serviço contratado, conforme as instruções da empresa.\nPara os dados de quem contrata e administra a conta (cadastro, contato e cobrança), a Dilon Tech é a controladora.",
  },
  {
    titulo: "2. Quais dados o sistema trata",
    texto:
      "- Do colaborador: nome, CPF, PIS (se informado), matrícula, cargo, data de admissão e de desligamento, jornada de trabalho.\n- Das marcações de ponto: data e hora, número sequencial, código de integridade, meio usado (aplicativo ou navegador), endereço IP e identificação do aparelho.\n- Localização: as coordenadas no momento da marcação, quando a empresa pede e o colaborador permite no aparelho.\n- Foto: uma selfie no momento da marcação, só para colaboradores que a empresa configurou para registro com foto. A foto serve para conferência visual. O sistema não faz reconhecimento facial e não cria modelo biométrico do rosto.\n- Ajustes, abonos e atestados lançados pela empresa, com o motivo e o nome de quem lançou.\n- Do administrador: nome, e-mail, CPF, senha (guardada de forma cifrada) e os dados de cobrança da empresa.",
  },
  {
    titulo: "3. Para que e com qual base legal",
    texto:
      "- Registrar a jornada de trabalho e emitir comprovantes, espelho de ponto e os arquivos exigidos pela fiscalização do trabalho: cumprimento de obrigação legal ou regulatória da empresa (LGPD, art. 7º, II), em especial o art. 74 da CLT e a Portaria MTP nº 671/2021.\n- Calcular horas, banco de horas e ocorrências e prestar o serviço contratado: execução de contrato (art. 7º, V).\n- Localização e foto na marcação: comprovar o local e quem registrou, para segurança do próprio registro, com base no legítimo interesse da empresa (art. 7º, IX), quando ela escolher usá-los. O colaborador pode negar a localização ou a câmera no aparelho, e a marcação é registrada mesmo assim.\n- Cobrança e atendimento do cliente: execução de contrato e cumprimento de obrigação legal fiscal.",
  },
  {
    titulo: "4. Com quem os dados são compartilhados",
    texto:
      "A Dilon Tech não vende nem cede dados. Eles são processados por fornecedores que hospedam e operam o sistema, sob contrato e só para isso: hospedagem da aplicação (Vercel), banco de dados (Neon), armazenamento de arquivos e fotos (Cloudflare) e emissão de boletos (Asaas, só com os dados da empresa contratante). Alguns desses serviços podem processar dados fora do Brasil, com as garantias previstas no art. 33 da LGPD.\nA empresa contratante pode entregar os registros de ponto à fiscalização do trabalho, à Justiça ou ao seu escritório contábil, como determina a lei.",
  },
  {
    titulo: "5. Por quanto tempo",
    texto:
      "Os registros de ponto, ajustes e arquivos legais não podem ser apagados nem alterados (Portaria 671, Anexo IX) e são guardados por no mínimo 5 anos, prazo que acompanha a prescrição trabalhista (CF, art. 7º, XXIX), ou por mais tempo se a empresa precisar para se defender em processo.\nAs fotos das marcações são guardadas pelo mesmo prazo do registro a que pertencem, salvo instrução diferente da empresa.\nAo fim do contrato, a empresa pode exportar seus dados. Depois, eles ficam guardados apenas pelo prazo legal e são então eliminados.",
  },
  {
    titulo: "6. Segurança",
    texto:
      "Acesso por login e senha, conexão sempre cifrada (HTTPS), senhas guardadas com hash, separação dos dados de cada empresa, registro de quem faz cada ajuste e marcações protegidas contra alteração por mecanismo no próprio banco de dados, com número sequencial e código de integridade em cadeia.",
  },
  {
    titulo: "7. Direitos do titular",
    texto:
      "Pela LGPD (art. 18), o titular pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento e eliminação, observados os prazos legais de guarda do registro de ponto.\nO colaborador deve fazer o pedido primeiro à empresa onde trabalha, que é a controladora. A Dilon Tech ajuda a empresa a atender. Pedidos também podem ser feitos diretamente à Dilon Tech pelo contato abaixo, e serão encaminhados à empresa responsável.",
  },
  {
    titulo: "8. Contato do encarregado",
    texto: "Responsável: Felipe Cerqueira, Dilon Tech\nWhatsApp: (21) 99399-9417\nSite: dilontech.com.br",
  },
];

export default function Privacidade() {
  return <DocumentoLegal titulo="Política de Privacidade do Dilon Ponto" vigencia="21/11/2026" secoes={SECOES} />;
}
