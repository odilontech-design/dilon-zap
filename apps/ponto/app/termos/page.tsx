import type { Metadata } from "next";
import Link from "@/components/link";
import { DocumentoLegal } from "@/components/documento-legal";

export const metadata: Metadata = { title: "Termos de Uso — Dilon Ponto" };

const SECOES = [
  {
    titulo: "1. O serviço",
    texto:
      "O Dilon Ponto, da Dilon Tech (CNPJ 64.601.665/0001-33), é um sistema de registro eletrônico de ponto via programa e de tratamento de registro de ponto, nos termos da Portaria MTP nº 671/2021. Ao criar a conta, a empresa contratante (\"cliente\") aceita estes termos.",
  },
  {
    titulo: "2. Conta e acesso",
    texto:
      "O administrador informado no cadastro responde pela conta e pelas pessoas a quem der acesso. Cada colaborador tem acesso próprio, com o CPF e uma senha pessoal. O cliente deve manter os dados da empresa, do estabelecimento e dos colaboradores corretos e atualizados, porque eles saem nos comprovantes e nos arquivos legais.",
  },
  {
    titulo: "3. O registro de ponto",
    texto:
      "- O sistema registra fielmente as marcações e não permite restringir horário, marcar automaticamente nem exigir autorização prévia para hora extra (Portaria 671, art. 74).\n- A marcação original nunca é alterada nem apagada. Correções são feitas por inclusão ou desconsideração, com motivo e com o nome de quem fez.\n- O colaborador recebe o comprovante de cada marcação e acessa o próprio espelho de ponto.\n- O cliente pode gerar a qualquer momento o AFD e o AEJ, assinados digitalmente, para entregar à fiscalização do trabalho.\n- A Dilon Tech fornece ao cliente o Atestado Técnico e Termo de Responsabilidade (art. 89), que deve ser guardado para apresentação à fiscalização.",
  },
  {
    titulo: "4. Responsabilidades do cliente",
    texto:
      "- Cadastrar corretamente as jornadas, regras de cálculo, feriados e acordos aplicáveis (como banco de horas e convenção coletiva) e conferir o espelho de ponto antes de usá-lo na folha de pagamento.\n- Informar os colaboradores sobre o uso do sistema e, quando usar localização ou foto, sobre essa coleta e sua finalidade.\n- Usar o sistema conforme a legislação trabalhista e a LGPD, como controlador dos dados dos seus colaboradores (ver a Política de Privacidade).\nOs cálculos seguem as regras configuradas pelo cliente. A folha de pagamento e as decisões trabalhistas são do cliente e do seu contador.",
  },
  {
    titulo: "5. Plano, pagamento e cancelamento",
    texto:
      "O plano contratado, seus limites e o valor são os informados na contratação. O pagamento é mensal, por boleto bancário, sem fidelidade: o cliente pode cancelar quando quiser, sem multa.\nSe a mensalidade ficar em aberto por mais de 5 dias depois do vencimento, o painel do administrador fica bloqueado até o pagamento. O registro de ponto dos colaboradores e a geração dos arquivos para a fiscalização continuam funcionando, e nenhum dado é apagado.",
  },
  {
    titulo: "6. Disponibilidade e suporte",
    texto:
      "A Dilon Tech mantém o sistema disponível de forma contínua. Se o aparelho do colaborador estiver sem internet, a marcação fica guardada nele e é enviada depois. O suporte é feito por telefone e chat, em horário comercial.",
  },
  {
    titulo: "7. Dados ao fim do contrato",
    texto:
      "Os registros de ponto são guardados pelo prazo legal mínimo de 5 anos, mesmo depois do cancelamento, para que o cliente possa apresentá-los quando precisar. A pedido, a Dilon Tech entrega os arquivos legais do período contratado.",
  },
  {
    titulo: "8. Responsabilidade",
    texto:
      "A Dilon Tech responde pelo funcionamento do sistema conforme estes termos e a Portaria 671. Não responde por dados incorretos informados pelo cliente, por configuração de regras diferente da aplicável à categoria, nem por uso em desacordo com a lei.",
  },
  {
    titulo: "9. Foro",
    texto: "Fica eleito o foro da Comarca de Duque de Caxias/RJ, salvo as hipóteses em que a lei determine outro.",
  },
];

export default function Termos() {
  return (
    <>
      <DocumentoLegal titulo="Termos de Uso do Dilon Ponto" vigencia="21/11/2026" secoes={SECOES} />
      <p className="mx-auto max-w-3xl px-5 pb-10 text-sm">
        Veja também a{" "}
        <Link href="/privacidade" className="text-accent">
          Política de Privacidade
        </Link>
        .
      </p>
    </>
  );
}
