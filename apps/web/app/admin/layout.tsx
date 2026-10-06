import { requireSuperAdmin } from "@/lib/session";
import { AdminSidebar } from "@/components/admin-sidebar";

/**
 * Campos de formulário NÃO herdam a cor do pai: o navegador aplica a própria,
 * preta. Num painel de fundo escuro isso dava texto preto dentro de caixa
 * preta — invisível até selecionar com o mouse.
 *
 * Regra única aqui, e não uma classe de cor em cada campo: são quinze hoje, e
 * o décimo sexto nasceria com o mesmo defeito sem ninguém perceber.
 *
 * `color-scheme: dark` é o que conserta o que o CSS não alcança — o calendário
 * do input de data, a setinha do select e a barra de rolagem, todos desenhados
 * pelo sistema operacional.
 */
const ESTILO_CAMPOS = `
.admin-escuro { color-scheme: dark; }
.admin-escuro input,
.admin-escuro textarea,
.admin-escuro select { color: #f5f5f5; }
.admin-escuro input::placeholder,
.admin-escuro textarea::placeholder { color: #737373; }
.admin-escuro option { background-color: #0a0a0a; color: #f5f5f5; }
`;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();

  return (
    // data-theme fixo em "light": o painel admin JÁ é escuro por desenho
    // próprio (bg-neutral-950, texto claro). Como a escala neutra agora vem
    // do tema, deixar o admin herdar o modo noite inverteria essas classes e
    // ele viraria claro. Prendendo a paleta original aqui, o alternador do
    // dashboard não tem como alcançar esta área.
    <div data-theme="light" className="admin-escuro min-h-screen flex flex-col md:flex-row bg-neutral-950">
      <style dangerouslySetInnerHTML={{ __html: ESTILO_CAMPOS }} />
      <AdminSidebar name={user.name} />
      {/* O menu fica parado e só o conteúdo rola — ver AdminSidebar. Sem o
          min-w-0 uma tabela larga empurraria a largura do flex e levaria o
          menu junto pra fora da tela. */}
      <main className="flex-1 min-w-0 bg-neutral-950">{children}</main>
    </div>
  );
}
