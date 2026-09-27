import type { ReactNode } from 'react'
import { LEGAL_ENTITY as E } from './legal'

// Terms, Privacy and Copyright texts. Written from what the app actually does
// (see PRODUCT.md principle 1: never claim a capability the code doesn't have);
// change them together with the behavior they describe. Revisão jurídica
// recomendada antes de publicar.

export type LegalDocumentKey = 'termos' | 'privacidade' | 'direitos-autorais'

export interface LegalDocument {
  title: string
  intro: ReactNode
  sections: { heading: string; body: ReactNode }[]
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  termos: {
    title: 'Termos de Uso',
    intro: (
      <p>
        Estes Termos regulam o uso do MediConsultas, sistema de agendamento, prontuário e receitas operado por {E.name}{' '}
        (CNPJ {E.cnpj}), com sede em {E.address}. Ao criar uma conta ou usar o sistema, pelo site ou pelo aplicativo
        Android, você concorda com estes Termos e com a Política de Privacidade.
      </p>
    ),
    sections: [
      {
        heading: '1. O que é o MediConsultas',
        body: (
          <p>
            Um sistema interno da clínica para marcar e confirmar consultas, registrar atendimentos, emitir receitas e
            liberar orientações aos pacientes. O MediConsultas não substitui atendimento de emergência: em caso de
            urgência, procure um pronto-socorro ou ligue 192 (SAMU).
          </p>
        ),
      },
      {
        heading: '2. Contas e perfis',
        body: (
          <>
            <p>O sistema tem quatro perfis, cada um com acesso só ao que precisa:</p>
            <ul>
              <li><strong>Paciente</strong>: cria a própria conta, acompanha consultas e acessa documentos liberados pelo médico.</li>
              <li><strong>Médico</strong>: cria a conta com CRM e só atende depois que a administração confere e aprova o registro.</li>
              <li><strong>Secretária</strong> e <strong>Administrador</strong>: acesso por convite da administração a uma conta já existente.</li>
            </ul>
            <p>
              No cadastro, confirmamos seu e-mail ou celular com um código de verificação. Você deve informar dados
              verdadeiros e mantê-los atualizados. Menores de 18 anos devem ser cadastrados e acompanhados pelo responsável legal.
            </p>
          </>
        ),
      },
      {
        heading: '3. Senha e segurança da conta',
        body: (
          <ul>
            <li>A senha deve ter ao menos 10 caracteres, com letra maiúscula, minúscula, número e símbolo. Não compartilhe sua senha.</li>
            <li>Após 5 tentativas de login erradas, a conta fica bloqueada por 15 minutos.</li>
            <li>A sessão expira em 30 minutos; com “Manter conectado”, dura até 30 dias neste aparelho.</li>
            <li>
              No aplicativo Android, você pode entrar com digital ou reconhecimento facial. Isso usa a biometria do
              próprio aparelho: o MediConsultas nunca recebe sua digital ou imagem do rosto.
            </li>
            <li>Avise a clínica imediatamente se suspeitar de uso indevido da sua conta.</li>
          </ul>
        ),
      },
      {
        heading: '4. Uso permitido',
        body: (
          <>
            <p>Você concorda em não:</p>
            <ul>
              <li>acessar dados de outras pessoas ou tentar burlar as permissões do seu perfil;</li>
              <li>usar a conta de outra pessoa ou criar cadastros com dados falsos;</li>
              <li>interferir no funcionamento, testar vulnerabilidades sem autorização ou automatizar acessos em massa;</li>
              <li>inserir conteúdo ilegal, ofensivo ou que viole direitos de terceiros.</li>
            </ul>
          </>
        ),
      },
      {
        heading: '5. Responsabilidade profissional',
        body: (
          <p>
            Prontuários, orientações e receitas são de responsabilidade do médico que os assina, conforme as normas do
            Conselho Federal de Medicina. A clínica é responsável pela agenda e pelo funcionamento do sistema. O
            MediConsultas é a ferramenta que registra e organiza essas informações.
          </p>
        ),
      },
      {
        heading: '6. Encerramento de conta',
        body: (
          <p>
            Você pode pedir o encerramento da sua conta à clínica. A administração também pode bloquear, suspender ou
            remover contas que violem estes Termos. Ao remover uma conta, o acesso é encerrado e o e-mail e o CPF ficam
            livres para um novo cadastro, mas o prontuário e o histórico clínico são mantidos pelo prazo exigido em lei
            (veja a Política de Privacidade).
          </p>
        ),
      },
      {
        heading: '7. Disponibilidade',
        body: (
          <p>
            Trabalhamos para manter o sistema disponível e seguro, mas ele pode passar por manutenções ou
            instabilidades. Não nos responsabilizamos por danos causados por uso indevido da conta por terceiros a quem
            você tenha dado acesso, ou por falhas de conexão do seu aparelho ou da sua internet.
          </p>
        ),
      },
      {
        heading: '8. Propriedade intelectual',
        body: (
          <p>
            A marca, o sistema e seus elementos visuais pertencem à clínica ou a seus licenciantes. Pedidos de remoção
            por violação de direitos autorais seguem a Política de Direitos Autorais.
          </p>
        ),
      },
      {
        heading: '9. Alterações e foro',
        body: (
          <p>
            Podemos atualizar estes Termos; mudanças relevantes serão avisadas no sistema. Estes Termos seguem a
            legislação brasileira, incluindo o Código de Defesa do Consumidor, e fica eleito o foro de {E.forum}, sem
            prejuízo do foro do domicílio do consumidor. Dúvidas: {E.contactEmail}.
          </p>
        ),
      },
    ],
  },

  privacidade: {
    title: 'Política de Privacidade',
    intro: (
      <p>
        Esta Política explica como {E.name} (CNPJ {E.cnpj}), controladora dos dados, trata informações pessoais no
        MediConsultas, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD). Dados de saúde são dados
        pessoais sensíveis e recebem proteção reforçada.
      </p>
    ),
    sections: [
      {
        heading: '1. Quais dados coletamos',
        body: (
          <ul>
            <li><strong>Pacientes</strong>: nome, CPF, data de nascimento, e-mail, telefone e endereço (com CEP).</li>
            <li><strong>Médicos</strong>: nome, e-mail, número do CRM e UF, especialidade e, se informado, celular e endereço.</li>
            <li><strong>Secretárias e administradores</strong>: nome e e-mail.</li>
            <li><strong>Dados de saúde</strong>: consultas agendadas, prontuários, orientações e receitas registrados pelos médicos.</li>
            <li>
              <strong>Dados de uso e segurança</strong>: registro de ações sensíveis (login, alterações de conta, emissão e
              finalização de documentos), com data, conta envolvida e se o acesso veio do site ou do aplicativo Android.
            </li>
          </ul>
        ),
      },
      {
        heading: '2. Para que usamos',
        body: (
          <ul>
            <li>agendar, confirmar e realizar consultas;</li>
            <li>registrar o atendimento e emitir receitas e documentos;</li>
            <li>confirmar sua identidade no cadastro e no login;</li>
            <li>proteger as contas e manter um histórico auditável de quem acessou ou alterou informações;</li>
            <li>cumprir obrigações legais e regulatórias da atividade médica.</li>
          </ul>
        ),
      },
      {
        heading: '3. Bases legais',
        body: (
          <p>
            Tratamos dados de saúde para a tutela da saúde, em procedimento realizado por profissionais de saúde (LGPD,
            art. 11, II, “f”), e para cumprir obrigações legais, como a guarda do prontuário (art. 11, II, “a”). Os demais
            dados são tratados para executar o serviço que você solicitou (art. 7º, V), cumprir obrigações legais (art.
            7º, II) e garantir a segurança da conta, com base no legítimo interesse (art. 7º, IX).
          </p>
        ),
      },
      {
        heading: '4. Com quem compartilhamos',
        body: (
          <>
            <p>Não vendemos dados pessoais. Os dados são acessados:</p>
            <ul>
              <li>pela equipe da clínica, cada perfil só naquilo de que precisa (a secretária, por exemplo, não vê prontuários);</li>
              <li>
                pelo serviço público ViaCEP: ao digitar o CEP no cadastro, o CEP (e só ele) é consultado para preencher o
                endereço;
              </li>
              <li>
                por prestadores que nos ajudem a operar o sistema, como hospedagem e envio de e-mail ou SMS com o código
                de verificação, sob contrato e apenas para esse fim;
              </li>
              <li>por autoridades, quando houver obrigação legal ou ordem judicial.</li>
            </ul>
          </>
        ),
      },
      {
        heading: '5. Como protegemos',
        body: (
          <ul>
            <li>CPF, telefone, endereço e número do CRM são armazenados criptografados.</li>
            <li>Senhas nunca são guardadas: armazenamos apenas um resumo irreversível (bcrypt).</li>
            <li>Códigos de verificação valem 10 minutos e também são guardados só como resumo irreversível.</li>
            <li>O acesso é separado por perfil, com bloqueio após tentativas de login erradas.</li>
            <li>Ações sensíveis ficam registradas em um log de auditoria que não pode ser editado pelos usuários.</li>
            <li>No aplicativo, o login por biometria guarda a sessão no cofre seguro do Android (Keystore); sua senha nunca é salva no aparelho.</li>
          </ul>
        ),
      },
      {
        heading: '6. Por quanto tempo guardamos',
        body: (
          <ul>
            <li>
              <strong>Prontuário e documentos clínicos</strong>: no mínimo 20 anos a partir do último registro, como
              exige a Lei 13.787/2018, mesmo que a conta seja removida.
            </li>
            <li><strong>Dados de cadastro</strong>: enquanto a conta existir e pelo prazo necessário a obrigações legais.</li>
            <li><strong>Registros de auditoria</strong>: pelo tempo necessário para a segurança e para defesa em processos.</li>
            <li><strong>Códigos de verificação</strong>: expiram em 10 minutos.</li>
          </ul>
        ),
      },
      {
        heading: '7. Seus direitos',
        body: (
          <>
            <p>
              Pela LGPD, você pode pedir: confirmação e acesso aos seus dados, correção, anonimização ou eliminação do
              que não for obrigatório guardar, portabilidade, informação sobre compartilhamentos e revisão de decisões. No
              próprio sistema, em “Meu perfil”, você já pode corrigir nome, telefone, endereço, e-mail e senha.
            </p>
            <p>
              Para os demais pedidos, fale com o encarregado de dados: {E.dpoName}, {E.dpoEmail}. Responderemos no prazo
              legal. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
            </p>
          </>
        ),
      },
      {
        heading: '8. Armazenamento no seu aparelho',
        body: (
          <p>
            O MediConsultas não usa cookies de rastreamento nem publicidade. O site guarda no navegador apenas a sua
            sessão de login e a preferência de tema (claro ou escuro). O aplicativo guarda a sessão no aparelho e, se
            você ativar, no cofre protegido por biometria.
          </p>
        ),
      },
      {
        heading: '9. Alterações',
        body: (
          <p>
            Esta Política pode ser atualizada. A data da última versão fica no topo desta página, e mudanças relevantes
            serão avisadas no sistema. Contato: {E.contactEmail}.
          </p>
        ),
      },
    ],
  },

  'direitos-autorais': {
    title: 'Política de Direitos Autorais',
    intro: (
      <p>
        Respeitamos direitos autorais e esperamos o mesmo dos usuários. Esta política explica como pedir a remoção de
        conteúdo que viole seus direitos, conforme a Lei de Direitos Autorais (Lei 9.610/1998) e o Marco Civil da Internet
        (Lei 12.965/2014). Também aceitamos notificações no formato do DMCA (17 U.S.C. § 512), dos Estados Unidos.
      </p>
    ),
    sections: [
      {
        heading: '1. Que conteúdo isso cobre',
        body: (
          <p>
            A maior parte do que existe no MediConsultas é informação clínica privada, visível só para o paciente e para
            a equipe responsável. Conteúdos que podem envolver direitos de terceiros são, por exemplo, o logotipo enviado
            pela clínica e textos ou imagens inseridos por usuários.
          </p>
        ),
      },
      {
        heading: '2. Como enviar uma notificação',
        body: (
          <>
            <p>Envie para {E.contactEmail}, com o assunto “Direitos autorais”, contendo:</p>
            <ul>
              <li>seu nome completo, e-mail e telefone (ou de quem representa o titular);</li>
              <li>a identificação da obra protegida;</li>
              <li>onde o conteúdo aparece no sistema, com a descrição mais precisa possível;</li>
              <li>uma declaração de que você acredita, de boa-fé, que o uso não foi autorizado pelo titular ou pela lei;</li>
              <li>uma declaração de que as informações são verdadeiras e de que você é o titular ou está autorizado a agir por ele;</li>
              <li>sua assinatura, física ou eletrônica.</li>
            </ul>
          </>
        ),
      },
      {
        heading: '3. O que acontece depois',
        body: (
          <p>
            Analisamos a notificação e, se ela estiver completa e procedente, removemos ou bloqueamos o conteúdo e
            avisamos quem o inseriu. Conteúdos que fazem parte do prontuário não podem ser apagados, por obrigação legal
            de guarda; nesses casos, o acesso é restringido na medida permitida pela lei.
          </p>
        ),
      },
      {
        heading: '4. Contranotificação',
        body: (
          <p>
            Se o seu conteúdo foi removido e você acredita que foi um engano, responda ao aviso explicando por quê, com
            seus dados de contato e uma declaração de boa-fé. Podemos restabelecer o conteúdo se a contranotificação for
            procedente ou se não houver medida judicial em andamento.
          </p>
        ),
      },
      {
        heading: '5. Reincidência e má-fé',
        body: (
          <p>
            Contas que violem direitos autorais repetidamente podem ser encerradas. Notificações falsas ou de má-fé podem
            gerar responsabilidade para quem as envia.
          </p>
        ),
      },
    ],
  },
}
