/**
 * Quem pode gerir o lado financeiro e de catálogo da empresa: produtos, preço,
 * estoque, pedidos, a receber e dados do recibo.
 *
 * Existe porque "OWNER ou FINANCEIRO" estava escrito à mão em quinze lugares
 * — dez rotas e cinco telas. Quando a Dilon Tech passou a usar a própria
 * ferramenta, o superadmin entrou numa empresa em que ele é o único usuário e
 * descobriu que Produtos abria só pra leitura e Pedidos mostrava "os pedidos
 * que você abriu aparecem no Inbox". Cada cópia da condição era um lugar a
 * esquecer; uma função só é um lugar a lembrar.
 *
 * SUPERADMIN entra porque, dentro da PRÓPRIA empresa, ele é o responsável. Isto
 * não dá acesso às empresas dos clientes: o tenant continua vindo da sessão.
 */
export function ehGerencia(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "FINANCEIRO" || role === "SUPERADMIN";
}
