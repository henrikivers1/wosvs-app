import type { AppLocale } from "@/i18n/config";
import { arabicInterface } from "@/i18n/locales/ar";
import { chineseInterface } from "@/i18n/locales/zh";
import { thaiInterface } from "@/i18n/locales/th";

const english = {
  notifications: "Notifications",
  unreadNotifications: "unread notifications",
  openProfileMenu: "Open profile menu",
  setupRequired: "Setup required",
  profile: "Profile",
  wosAccounts: "WOS accounts",
  signOut: "Sign out",
  signIn: "Sign in",
  overwatch: "Overwatch",
  intel: "Intel",
  votes: "Votes",
  planning: "Planning",
  liveBattle: "Live Battle",
  state: "State",
  activeWorkspace: "Active workspace",
  noStateSelected:
    "No state selected. Check your notifications for an invitation.",
  language: "Language",
  mainNavigation: "Main navigation",
  roleOwner: "owner",
  roleAdmin: "admin",
  roleMember: "member",
  delete: "Delete",
} as const;

const spanishInterface: Record<string, string> = {
  "Discord":
    "Discord",
  "Copy Discord name":
    "Copiar nombre de Discord",
  "Copied":
    "Copiado",
  "Copy":
    "Copiar",
  "How do I get help or get my state set up?":
    "¿Cómo consigo ayuda o pongo en marcha mi estado?",
  "Message us on Discord: wosoverwatch. We help states get started and answer questions there.":
    "Escríbenos en Discord: wosoverwatch. Allí ayudamos a los estados a empezar y respondemos preguntas.",
  "Where do I get help?":
    "¿Dónde consigo ayuda?",
  "Message us on Discord: wosoverwatch. Your state's admins can also help with anything inside your state.":
    "Escríbenos en Discord: wosoverwatch. Los administradores de tu estado también pueden ayudarte con todo lo de tu estado.",
  "The battle runs in three pet blocks: 12–14, 14–16 and 16–17 UTC. Each rally gets one Rally Lead per block, so leads swap when their pets run out, while the joiners stay. Rallies go into their first lead's alliance. Players are added by your auto-fill priorities and only get a joiner hero they own at 4★.":
    "La batalla tiene tres bloques de mascotas: 12–14, 14–16 y 16–17 UTC. Cada rally tiene un líder por bloque, así que los líderes se turnan cuando se agotan sus mascotas y los participantes se quedan. Los rallies van a la alianza de su primer líder. Los jugadores se añaden según tus prioridades de autorrelleno y solo reciben un héroe de unión que tengan a 4★.",
  "The garrison":
    "La guarnición",
  "One garrison holds the castle the whole battle. It is filled first, with the strongest defenders who play the whole battle: highest troop FC, then troop tier, then troop skill. Up to three Castle Holders take turns, one per pet block. When it's their turn they swap to the alliance holding the castle and take over; they bring no joiners. Set the garrison size under SvS automation.":
    "Una guarnición defiende el castillo toda la batalla. Se llena primero con los mejores defensores que juegan toda la batalla: mayor FC de tropas, luego nivel de tropas y luego habilidad. Hasta tres defensores del castillo se turnan, uno por bloque de mascotas. Cuando les toca, se cambian a la alianza que tiene el castillo y toman el mando, sin traer participantes. Ajusta el tamaño de la guarnición en Automatización SvS.",
  "Press Leads & holders in Planning to mark Rally Leads (ranked by Labyrinth) and Castle Holders (ranked by defense). They only lead or hold and are never placed as joiners. Change who leads a block under a rally's ⋯ → Leads by pet block, or the garrison's ⋯ → Castle holders by pet block.":
    "Pulsa Líderes y defensores en Planificación para marcar líderes de rally (por Laberinto) y defensores del castillo (por defensa). Solo lideran o defienden y nunca se colocan como participantes. Cambia quién lidera cada bloque en ⋯ del rally → Líderes por bloque de mascotas, o en ⋯ de la guarnición → Defensores del castillo por bloque de mascotas.",
  "Six hours before the battle the plan is published and you get a message like “Hi Frost, you've been assigned to Ted's rally in Frost Wolves. You're joining with Jessie and 50/20/30 formation. Leads: Ted 12:00–14:00, Ice 14:00–16:00.” Rally Leads are told which blocks they lead, Castle Holders when to take over, and the garrison to stay in the castle. Overwatch shows the same details, and you are told about every change.":
    "Seis horas antes de la batalla se publica el plan y recibes un mensaje como «Hola Frost, te han asignado al rally de Ted en Frost Wolves. Te unes con Jessie y formación 50/20/30. Líderes: Ted 12:00–14:00, Ice 14:00–16:00.» Los líderes de rally saben qué bloques lideran, los defensores del castillo cuándo tomar el mando y la guarnición que debe quedarse en el castillo. Overwatch muestra lo mismo y te avisamos de cada cambio.",
  "Add garrison":
    "Añadir guarnición",
  "After the draw, the app reminds members to vote 30 hours before the battle. 24 hours before, it sets up the garrison (your Castle Holders, one per pet block) and the rallies (your Rally Leads, swapping each pet block), then fills the garrison with the strongest defenders and the rallies with everyone else. Late voters are added every hour, and the plan is published 6 hours before. You can change anything by hand in Planning.":
    "Tras el sorteo, la app recuerda a los miembros que voten 30 horas antes de la batalla. 24 horas antes prepara la guarnición (tus defensores del castillo, uno por bloque de mascotas) y los rallies (tus líderes de rally, que se turnan en cada bloque), y llena la guarnición con los mejores defensores y los rallies con el resto. Quienes votan tarde se añaden cada hora y el plan se publica 6 horas antes. Puedes cambiar cualquier cosa a mano en Planificación.",
  "Alliance holding the castle":
    "Alianza que tiene el castillo",
  "Castle Holder":
    "Defensor del castillo",
  "Castle holders":
    "Defensores del castillo",
  "Castle holders by pet block":
    "Defensores del castillo por bloque de mascotas",
  "Castle holders saved.":
    "Defensores del castillo guardados.",
  "Choose holder":
    "Elegir defensor",
  "Choose holders":
    "Elegir defensores",
  "Choose lead":
    "Elegir líder",
  "Choose leads":
    "Elegir líderes",
  "Choose the alliance holding the castle.":
    "Elige la alianza que tiene el castillo.",
  "Delete garrison":
    "Eliminar guarnición",
  "Edit garrison":
    "Editar guarnición",
  "Garrison actions":
    "Acciones de la guarnición",
  "Garrison added. Fill open seats to put your strongest defenders in it.":
    "Guarnición añadida. Llena las plazas libres para poner a tus mejores defensores.",
  "Garrison size (without holders)":
    "Tamaño de la guarnición (sin defensores del castillo)",
  "Hi {player}, you lead {group} {blocks} UTC in {alliance}.":
    "Hola {player}, lideras {group} {blocks} UTC en {alliance}.",
  "Hi {player}, you're a castle holder {blocks} UTC. When it's your turn, swap to the alliance holding the castle and take over the garrison.":
    "Hola {player}, defiendes el castillo {blocks} UTC. Cuando te toque, cámbiate a la alianza que tiene el castillo y toma el mando de la guarnición.",
  "Hi {player}, you're in the garrison holding the castle in {alliance}. Stay in the castle the whole battle.":
    "Hola {player}, estás en la guarnición que defiende el castillo en {alliance}. Quédate en el castillo toda la batalla.",
  "Holders: {leads}.":
    "Defensores: {leads}.",
  "Holds the castle all battle":
    "Defiende el castillo toda la batalla",
  "Leads & holders":
    "Líderes y defensores",
  "Leads & holders ({count})":
    "Líderes y defensores ({count})",
  "Leads and holders stay with their group. Change its leads under ⋯ → Leads by pet block.":
    "Líderes y defensores se quedan en su grupo. Cambia sus líderes en ⋯ → Líderes por bloque de mascotas.",
  "Leads by pet block":
    "Líderes por bloque de mascotas",
  "Leads or holds in {rally}. Change who leads each pet block under the group's ⋯ menu.":
    "Lidera o defiende en {rally}. Cambia quién lidera cada bloque en el menú ⋯ del grupo.",
  "Leads saved.":
    "Líderes guardados.",
  "Leads: {leads}.":
    "Líderes: {leads}.",
  "Mark Rally Leads first: Leads & holders button above the board.":
    "Marca primero a los líderes de rally: botón Líderes y defensores encima del tablero.",
  "Nobody":
    "Nadie",
  "Nobody holds the castle {blocks}.":
    "Nadie defiende el castillo {blocks}.",
  "Nobody is marked yet. Use Leads & holders above the board.":
    "Aún no hay nadie marcado. Usa Líderes y defensores encima del tablero.",
  "Rally Leads and Castle Holders only lead or hold, so they can't join. Set them under a rally's ⋯ → Leads by pet block.":
    "Los líderes de rally y defensores del castillo solo lideran o defienden, así que no pueden unirse. Asígnalos en ⋯ del rally → Líderes por bloque de mascotas.",
  "Rally Leads and Castle Holders only lead or hold, so they never join. Put them in a rally's or the garrison's pet blocks under its ⋯ menu.":
    "Los líderes de rally y defensores del castillo solo lideran o defienden, nunca se unen. Ponlos en los bloques de un rally o de la guarnición desde su menú ⋯.",
  "Rally Leads lead rallies and swap each pet block; Castle Holders take turns holding the castle. Neither is ever placed as a joiner.":
    "Los líderes de rally lideran rallies y se turnan en cada bloque de mascotas; los defensores del castillo se turnan para defenderlo. Ninguno se coloca nunca como participante.",
  "Rally leads":
    "Líderes de rally",
  "Rank by":
    "Ordenar por",
  "Stay in the castle the whole battle.":
    "Quédate en el castillo toda la batalla.",
  "Strongest defenders":
    "Mejores defensores",
  "There is no garrison to hold the castle yet.":
    "Aún no hay guarnición que defienda el castillo.",
  "There is no garrison yet. Mark your Castle Holders first.":
    "Aún no hay guarnición. Marca primero a tus defensores del castillo.",
  "Top Labyrinth":
    "Mejor Laberinto",
  "Total power {power}":
    "Poder total {power}",
  "You hold the castle":
    "Defiendes el castillo",
  "You hold the castle {blocks} UTC.":
    "Defiendes el castillo {blocks} UTC.",
  "You lead {blocks} UTC.":
    "Lideras {blocks} UTC.",
  "You're in the garrison":
    "Estás en la guarnición",
  "hasn't voted for this time":
    "no votó para esta hora",
  "nothing yet":
    "nada aún",
  "{leads} Rally Leads · {holders} Castle Holders":
    "{leads} líderes de rally · {holders} defensores del castillo",
  "{name} is a Rally Lead or Castle Holder but joins {rally}. Leads and holders never join.":
    "{name} es líder de rally o defensor del castillo pero se une a {rally}. Líderes y defensores nunca se unen.",
  "{name} leads {rally} {block}, but voted {voted}.":
    "{name} lidera {rally} {block}, pero votó {voted}.",
  "{rally} has no lead {blocks}.":
    "{rally} no tiene líder {blocks}.",
  "In State management, SvS automation decides how many rallies are built, how many players each takes, the default formation, the four default joiner heroes and the order auto-fill weighs players in. Turn automatic rallies or automatic publishing off if you prefer to do them yourself.":
    "En Gestión del estado, la automatización SvS decide cuántos rallies se crean, cuántos jugadores lleva cada uno, la formación por defecto, los cuatro héroes de unión por defecto y el orden en que el autorrelleno valora a los jugadores. Desactiva los rallies o la publicación automáticos si prefieres hacerlo tú.",
  "Planning opens with a checklist: the draw, votes, rallies, publishing and Live Battle, each with when it happens automatically. The gold button runs the next step now: Generate now, then Publish now.":
    "Planificación empieza con una lista: el sorteo, los votos, los rallies, la publicación y la batalla en vivo, cada uno con cuándo ocurre automáticamente. El botón dorado ejecuta ya el siguiente paso: Generar ahora y luego Publicar ahora.",
  "Under the checklist, Needs attention lists what to check before publishing: a rally without an alliance or heroes, a player in the wrong half, players without a joiner hero, or open seats while players wait. Each line has a button that fixes it. When the list is empty, publish.":
    "Bajo la lista, Requiere atención muestra qué revisar antes de publicar: un rally sin alianza o sin héroes, un jugador en la mitad equivocada, jugadores sin héroe de unión o plazas libres mientras hay jugadores esperando. Cada línea tiene un botón que lo arregla. Cuando la lista quede vacía, publica.",
  "Drag players between rallies or from the Waiting list. Tap a player to change their rally or the hero they bring. A rally's ⋯ menu has Rally setup (formation, half and joiner heroes), Assign heroes, Edit and Delete. Nothing you change is undone by the automation.":
    "Arrastra jugadores entre rallies o desde la lista de espera. Toca a un jugador para cambiar su rally o el héroe que lleva. El menú ⋯ de cada rally tiene Configuración del rally (formación, mitad y héroes de unión), Asignar héroes, Editar y Eliminar. La automatización nunca deshace tus cambios.",
  "Add rally":
    "Añadir rally",
  "Auto-fill only places players who can play the rally's half, and gives each a joiner hero they have at 4★. Then it weighs players in this order:":
    "El autorrelleno solo coloca a jugadores que pueden jugar la mitad del rally y da a cada uno un héroe de unión que tenga a 4★. Después ordena a los jugadores así:",
  "Availability":
    "Disponibilidad",
  "Choose heroes":
    "Elegir héroes",
  "Close":
    "Cerrar",
  "Delete rally":
    "Eliminar rally",
  "Delete “{name}”? Its {count} players go back to the waiting list.":
    "¿Eliminar «{name}»? Sus {count} jugadores vuelven a la lista de espera.",
  "Done":
    "Listo",
  "Drag players here.":
    "Arrastra jugadores aquí.",
  "Edit plan":
    "Editar plan",
  "Edit rally":
    "Editar rally",
  "Every rally has its alliance, its half and its heroes.":
    "Cada rally tiene su alianza, su mitad y sus héroes.",
  "Fill open seats":
    "Llenar plazas libres",
  "More actions":
    "Más acciones",
  "More filters":
    "Más filtros",
  "More options":
    "Más opciones",
  "Move to {rally}":
    "Mover a {rally}",
  "Move {count} selected here":
    "Mover aquí {count} seleccionados",
  "Needs attention":
    "Requiere atención",
  "No formation":
    "Sin formación",
  "No hero":
    "Sin héroe",
  "No joiner heroes":
    "Sin héroes de unión",
  "No players waiting.":
    "No hay jugadores esperando.",
  "No rallies yet":
    "Aún no hay rallies",
  "Not in a rally":
    "Sin rally",
  "Not in a rally yet":
    "Aún sin rally",
  "Nothing to check":
    "Nada que revisar",
  "Only players who can play":
    "Solo quienes pueden jugar",
  "Plan actions":
    "Acciones del plan",
  "Press Generate now above, or add a rally from the ⋯ menu.":
    "Pulsa Generar ahora arriba o añade un rally desde el menú ⋯.",
  "Rallies rebuilt: {count} players placed.":
    "Rallies reconstruidos: {count} jugadores colocados.",
  "Rally actions":
    "Acciones del rally",
  "Rally added.":
    "Rally añadido.",
  "Rally updated.":
    "Rally actualizado.",
  "Ready. Late voters are added to open seats every hour.":
    "Listo. Quienes voten tarde se añaden a plazas libres cada hora.",
  "Rebuild all rallies":
    "Reconstruir todos los rallies",
  "Rebuild every rally from scratch? Leaders stay; everyone else is placed again by your auto-fill priorities, and hand-made changes are lost.":
    "¿Reconstruir cada rally desde cero? Los líderes se quedan; el resto se coloca de nuevo según tus prioridades de autorrelleno y se pierden los cambios manuales.",
  "Republish “{name}”? Every member gets their updated assignment.":
    "¿Volver a publicar «{name}»? Cada miembro recibe su asignación actualizada.",
  "Republished. {count} accounts notified.":
    "Publicado de nuevo. {count} cuentas avisadas.",
  "Save rally":
    "Guardar rally",
  "Search players":
    "Buscar jugadores",
  "Select {name}":
    "Seleccionar a {name}",
  "Show all {count}":
    "Mostrar los {count}",
  "Show fewer":
    "Mostrar menos",
  "Showing the first {shown} of {count}. Search to find others.":
    "Se muestran los primeros {shown} de {count}. Busca para encontrar a otros.",
  "TED Rally":
    "Rally de TED",
  "Take out of rally":
    "Sacar del rally",
  "The automation builds and publishes the plan. Check what needs attention, adjust anything by hand, and publish.":
    "La automatización crea y publica el plan. Revisa lo que requiere atención, ajusta lo que quieras a mano y publica.",
  "Troops":
    "Tropas",
  "Waiting":
    "En espera",
  "Waiting players":
    "Jugadores en espera",
  "Who goes in which rally":
    "Quién va en cada rally",
  "Your admins have not set up the rallies yet.":
    "Tus administradores aún no han preparado los rallies.",
  "{count} players have none of the joiner heroes in any rally with room. They join without a hero.":
    "{count} jugadores no tienen ninguno de los héroes de unión de los rallies con plazas. Se unen sin héroe.",
  "{count} players haven't entered their heroes. They can add them on Account.":
    "{count} jugadores no han indicado sus héroes. Pueden añadirlos en Cuenta.",
  "{count} players in {rally} have no joiner hero yet.":
    "{count} jugadores de {rally} aún no tienen héroe de unión.",
  "{count} rallies have no joiner heroes. Set default heroes under State management → SvS automation, or choose them per rally.":
    "{count} rallies no tienen héroes de unión. Define héroes por defecto en Gestión del estado → Automatización SvS, o elígelos en cada rally.",
  "{count} things to check below.":
    "{count} cosas que revisar abajo.",
  "{name} can't join but is in {rally}.":
    "{name} no puede unirse pero está en {rally}.",
  "{name} has none of {rally}'s joiner heroes at 4★.":
    "{name} no tiene ninguno de los héroes de unión de {rally} a 4★.",
  "{name} hasn't voted but is in {rally}.":
    "{name} no ha votado pero está en {rally}.",
  "{name} voted {voted}, but {rally} fights {half}.":
    "{name} votó {voted}, pero {rally} combate en {half}.",
  "{rally} has no destination alliance.":
    "{rally} no tiene alianza de destino.",
  "{rally} has no joiner heroes chosen.":
    "{rally} no tiene héroes de unión elegidos.",
  "{slots} open seats, and {waiting} players who can play are waiting.":
    "{slots} plazas libres y {waiting} jugadores que pueden jugar esperando.",
  "Live Battle is open: SvS vs state {opponent} {when}":
    "Batalla en vivo abierta: SvS contra el estado {opponent} {when}",
  "Live Battle opens automatically at 11:00 UTC on battle day, an hour before the battle starts. Live tools appear here then.":
    "La batalla en vivo se abre automáticamente a las 11:00 UTC el día de la batalla, una hora antes de que empiece. Las herramientas en vivo aparecerán aquí entonces.",
  "Live Battle opens at {time}, an hour early, so garrison and coordinators can enter coordinates.":
    "La batalla en vivo se abre a las {time}, una hora antes, para que la guarnición y los coordinadores introduzcan coordenadas.",
  "Live Battle opens automatically":
    "La batalla en vivo se abre automáticamente",
  "11:00 UTC":
    "11:00 UTC",
  "Live Battle opens for coordinates":
    "Se abre la batalla en vivo para las coordenadas",
  "Live Battle opens by itself at 11:00 UTC, an hour before the battle, for everyone with the Garrison or Coordinator role. Use that hour to enter coordinates.":
    "La batalla en vivo se abre sola a las 11:00 UTC, una hora antes de la batalla, para todos con el rol de Guarnición o Coordinador. Usa esa hora para introducir coordenadas.",
  "It only appears from 11:00 to 17:00 UTC on battle day, and only for admins and members with the Coordinator or Garrison role.":
    "Solo aparece de 11:00 a 17:00 UTC el día de la batalla, y solo para administradores y miembros con el rol de Coordinador o Guarnición.",
  "Could not confirm email":
    "No se pudo confirmar el correo",
  "Privacy":
    "Privacidad",
  "Your data in Overwatch":
    "Tus datos en Overwatch",
  "How we use your data":
    "Cómo usamos tus datos",
  "What we store":
    "Qué guardamos",
  "Your login: email address and password. The password is stored only as a secure hash by our login provider; we never see it.":
    "Tu inicio de sesión: correo y contraseña. Nuestro proveedor de inicio de sesión guarda la contraseña solo como un hash seguro; nunca la vemos.",
  "Your public username and the WOS IDs you add.":
    "Tu nombre de usuario público y los WOS ID que añadas.",
  "Game data for those WOS IDs from WOSOracle: name, avatar, state, power, Furnace level, Labyrinth score and alliance.":
    "Datos de juego de esos WOS ID desde WOSOracle: nombre, avatar, estado, poder, nivel del Horno, puntuación del Laberinto y alianza.",
  "What you enter in Overwatch: attendance votes, joiner heroes, troop details, and your state memberships and roles.":
    "Lo que introduces en Overwatch: votos de asistencia, héroes de unión, datos de tropas y tus membresías y roles de estado.",
  "What your state's admins and coordinators enter: rally assignments, notices, tags, and enemy leaders with their city coordinates.":
    "Lo que introducen los administradores y coordinadores de tu estado: asignaciones de rally, avisos, etiquetas y líderes enemigos con las coordenadas de su ciudad.",
  "Your notifications.":
    "Tus notificaciones.",
  "Why":
    "Para qué",
  "Only to run Overwatch for you and your state: sign-in, planning rallies, timing reinforcements and telling you about changes.":
    "Solo para que Overwatch funcione para ti y tu estado: iniciar sesión, planificar rallies, cronometrar refuerzos y avisarte de los cambios.",
  "No ads, no tracking, no analytics. We never sell or share your data for marketing.":
    "Sin anuncios, sin rastreo, sin analíticas. Nunca vendemos ni compartimos tus datos con fines de marketing.",
  "Who can see it":
    "Quién puede verlo",
  "Members of your state see your username, game data, rally and votes. Admins also see join requests and roles.":
    "Los miembros de tu estado ven tu nombre de usuario, datos de juego, rally y votos. Los administradores también ven solicitudes de unión y roles.",
  "Your email address is never shown to other players.":
    "Tu correo nunca se muestra a otros jugadores.",
  "Services we use":
    "Servicios que usamos",
  "Supabase stores the database and handles sign-in.":
    "Supabase guarda la base de datos y gestiona el inicio de sesión.",
  "Vercel hosts the website.":
    "Vercel aloja el sitio web.",
  "An email service sends sign-up and password emails.":
    "Un servicio de correo envía los correos de registro y de contraseña.",
  "WOSOracle provides the game data; we send it only WOS IDs, state numbers and alliance IDs.":
    "WOSOracle proporciona los datos de juego; solo le enviamos WOS ID, números de estado e ID de alianza.",
  "These services may process data outside your country.":
    "Estos servicios pueden tratar datos fuera de tu país.",
  "Cookies and your browser":
    "Cookies y tu navegador",
  "One sign-in cookie keeps you logged in. There are no other cookies.":
    "Una cookie de inicio de sesión te mantiene conectado. No hay más cookies.",
  "Your browser stores your language, your last state, your garrison settings and, if you open it, the demo. This never leaves your device.":
    "Tu navegador guarda tu idioma, tu último estado, tus ajustes de guarnición y, si la abres, la demo. Esto nunca sale de tu dispositivo.",
  "How long we keep it":
    "Cuánto tiempo lo guardamos",
  "Read notifications are removed after 30 days and all notifications after 90 days.":
    "Las notificaciones leídas se eliminan a los 30 días y todas las notificaciones a los 90 días.",
  "Expired notices and invitations are removed automatically.":
    "Los avisos e invitaciones caducados se eliminan automáticamente.",
  "Everything else is kept until you remove it or ask us to delete your account.":
    "Todo lo demás se guarda hasta que lo elimines o nos pidas borrar tu cuenta.",
  "Your rights":
    "Tus derechos",
  "You can remove WOS accounts on Account at any time.":
    "Puedes quitar cuentas de WOS en Cuenta en cualquier momento.",
  "Email us to get a copy of your data, correct it, or delete your account and everything linked to it. We answer within 30 days.":
    "Escríbenos para obtener una copia de tus datos, corregirlos o borrar tu cuenta y todo lo vinculado a ella. Respondemos en un plazo de 30 días.",
  "If you are in the EU or UK you can also complain to your data protection authority.":
    "Si estás en la UE o el Reino Unido, también puedes reclamar ante tu autoridad de protección de datos.",
  "Contact":
    "Contacto",
  "Questions or requests:":
    "Preguntas o solicitudes:",
  "Back to Overwatch":
    "Volver a Overwatch",
  "Rally 1":
    "Rally 1",
  "Rally 2":
    "Rally 2",
  "6 rally groups, 58 players":
    "6 grupos de rally, 58 jugadores",
  "Getting started":
    "Primeros pasos",
  "Everyone":
    "Todos",
  "Create an account, add your WOS ID and join your state. It takes about two minutes.":
    "Crea una cuenta, añade tu WOS ID y únete a tu estado. Solo te lleva unos dos minutos.",
  "Create your account":
    "Crea tu cuenta",
  "Open Sign in and choose Sign up.":
    "Abre Iniciar sesión y elige Regístrate.",
  "Enter your email, a password, a public username and your WOS ID.":
    "Introduce tu correo, una contraseña, un nombre de usuario público y tu WOS ID.",
  "Confirm your email if you are asked to.":
    "Confirma tu correo si te lo piden.",
  "Want to look around first? The free demo needs no account.":
    "¿Quieres echar un vistazo primero? La demo gratis no necesita cuenta.",
  "Add your WOS accounts":
    "Añade tus cuentas de WOS",
  "On Account, add every WOS ID you play. Your name, avatar, state, power, Furnace, Labyrinth score and alliance are filled in from WOSOracle. They refresh every Monday, and you can refresh by hand once a day.":
    "En Cuenta, añade cada WOS ID con el que juegas. Tu nombre, avatar, estado, poder, Horno, puntuación del Laberinto y alianza se rellenan desde WOSOracle. Se actualizan cada lunes, y puedes actualizarlos a mano una vez al día.",
  "When your in-game state uses Overwatch, adding your WOS ID sends a join request to its owner and admins automatically. You get a notification as soon as they approve it. An admin can also invite your WOS ID; accept the invitation under the bell.":
    "Si tu estado del juego usa Overwatch, al añadir tu WOS ID se envía automáticamente una solicitud de unión a su propietario y administradores. Recibes una notificación en cuanto la aprueben. Un administrador también puede invitar a tu WOS ID; acepta la invitación desde la campana.",
  "Tell us your joiner heroes":
    "Dinos tus héroes de apoyo",
  "On Account, tick every joiner hero you have at 4★ or higher. Rallies only give you a hero you own, so this decides which rally you can join.":
    "En Cuenta, marca cada héroe de apoyo que tengas con 4★ o más. En los rallies solo te toca un héroe que tengas, así que esto decide a qué rally puedes unirte.",
  "Language and notifications":
    "Idioma y notificaciones",
  "Change the language with the globe in the header. The bell shows your notifications, coloured by kind: green Victory, red Defeat, blue rally assignments, purple roles, gold alliances.":
    "Cambia el idioma con el globo de la cabecera. La campana muestra tus notificaciones, con un color por tipo: verde Victoria, rojo Derrota, azul asignaciones de rally, morado roles, dorado alianzas.",
  "Before the SvS":
    "Antes de la SvS",
  "After the draw you only need to do one thing: say when you can play.":
    "Tras el sorteo solo tienes que hacer una cosa: decir cuándo puedes jugar.",
  "Vote your attendance":
    "Vota tu asistencia",
  "Open Overwatch.":
    "Abre Overwatch.",
  "Pick Whole battle, First half (12:00–14:30 UTC), Second half (14:30–17:00 UTC) or Can't join.":
    "Elige Toda la batalla, Primera mitad (12:00–14:30 UTC), Segunda mitad (14:30–17:00 UTC) o No puedo.",
  "Tick voice call if you can join it.":
    "Marca chat de voz si puedes unirte.",
  "You can change your answer until the battle starts. If you have not voted 30 hours before, you get a reminder.":
    "Puedes cambiar tu respuesta hasta que empiece la batalla. Si no has votado 30 horas antes, te llega un recordatorio.",
  "Get your rally":
    "Recibe tu rally",
  "Check the opponent":
    "Revisa al rival",
  "Intel shows the opponent's strongest players, their alliances and their SvS record next to your own state's numbers.":
    "Inteligencia muestra los jugadores más fuertes del rival, sus alianzas y su historial de SvS junto a las cifras de tu propio estado.",
  "During the battle":
    "Durante la batalla",
  "Garrison and coordinators":
    "Guarnición y coordinadores",
  "Garrison: when to send":
    "Guarnición: cuándo enviar",
  "Open Live Battle, then Garrison.":
    "Abre Batalla en vivo y luego Guarnición.",
  "Enter your city's X and Y once; your march time is worked out for you.":
    "Introduce la X y la Y de tu ciudad una sola vez; tu tiempo de marcha se calcula solo.",
  "Turn on sound and notifications.":
    "Activa el sonido y las notificaciones.",
  "Send when the countdown reaches zero.":
    "Envía cuando la cuenta atrás llegue a cero.",
  "The timer aims your reinforcements between two enemy rallies, or right after the last one hits.":
    "El temporizador hace que tus refuerzos lleguen entre dos rallies enemigos, o justo después de que golpee el último.",
  "If the game lags on your connection, add your ping in milliseconds under Send early.":
    "Si el juego va con retraso en tu conexión, añade tu ping en milisegundos en Enviar antes.",
  "The shared battle clock":
    "El reloj de batalla compartido",
  "Every device times against the same server clock, so a phone that is a few seconds off still sends on time. If it says the clock is not synchronized, press Resync clock.":
    "Todos los dispositivos se sincronizan con el mismo reloj del servidor, así que un móvil que va unos segundos desfasado envía igualmente a tiempo. Si indica que el reloj no está sincronizado, pulsa Resincronizar reloj.",
  "Coordinators: enemy leaders":
    "Coordinadores: líderes enemigos",
  "Under Enemy leaders the opponent's 20 strongest players are already listed. Tap Use, enter the city coordinates and add them. Coordinates are remembered: next time that player is prefilled, and known leaders are added automatically when the battle starts. Mark a leader's pet when it is active.":
    "En Líderes enemigos ya aparecen los 20 jugadores más fuertes del rival. Toca Usar, introduce las coordenadas de la ciudad y añádelos. Las coordenadas se recuerdan: la próxima vez ese jugador aparece ya rellenado, y los líderes conocidos se añaden solos al empezar la batalla. Marca la mascota de un líder cuando esté activa.",
  "Coordinators: call a rally":
    "Coordinadores: registrar un rally",
  "Open Call rally and pick the enemy leader.":
    "Abre Registrar rally y elige el líder enemigo.",
  "Type the rally timer you see in the game, for example 4:59.":
    "Escribe el temporizador del rally que ves en el juego, por ejemplo 4:59.",
  "Press Call rally the moment the in-game timer shows that value.":
    "Pulsa Registrar rally justo cuando el temporizador del juego muestre ese valor.",
  "Every second of delay shifts the whole schedule. Cancel a rally only if it was called by mistake; it disappears for everyone.":
    "Cada segundo de retraso desplaza todo el horario. Cancela un rally solo si se registró por error; desaparece para todos.",
  "After the battle":
    "Después de la batalla",
  "The battle ends at 17:00 UTC. As soon as WOSOracle has the result, every member gets Victory or Defeat. Past battles are under State, Stats & history.":
    "La batalla termina a las 17:00 UTC. En cuanto WOSOracle tiene el resultado, cada miembro recibe Victoria o Derrota. Las batallas anteriores están en Estado, Estadísticas e historial.",
  "Running your state":
    "Gestiona tu estado",
  "Owners and admins":
    "Propietarios y administradores",
  "Overwatch does the routine work for every SvS. These are the places to look and the settings that shape it.":
    "Overwatch hace el trabajo rutinario de cada SvS. Estos son los sitios que revisar y los ajustes que lo definen.",
  "First setup":
    "Configuración inicial",
  "The in-game state number fills in from the owner's WOS account.":
    "El número de estado del juego se rellena desde la cuenta de WOS del propietario.",
  "Under State management, set your hero generation so only unlocked heroes are offered.":
    "En Gestión del estado, configura tu generación de héroes para que solo se ofrezcan héroes desbloqueados.",
  "Add your alliances: load them from WOSOracle, add a shell alliance by its ID, or type a name.":
    "Añade tus alianzas: cárgalas desde WOSOracle, añade una alianza vacía por su ID o escribe un nombre.",
  "Give Coordinator and Garrison roles to the right members.":
    "Da los roles de Coordinador y Guarnición a los miembros adecuados.",
  "SvS automation settings":
    "Ajustes de automatización SvS",
  "The Next SvS checklist":
    "La lista de la próxima SvS",
  "How rallies are built":
    "Cómo se crean los rallies",
  "Adjust by hand":
    "Ajusta a mano",
  "Members and join requests":
    "Miembros y solicitudes de unión",
  "Approve join requests under Waiting for your verification. The owner sets who is an admin; admins can give the Coordinator or Garrison role and remove members. Every change is sent to the member as a notification.":
    "Aprueba las solicitudes de unión en Esperando tu verificación. El propietario decide quién es administrador; los administradores pueden dar el rol de Coordinador o Guarnición y eliminar miembros. Cada cambio se envía al miembro como notificación.",
  "A WOS ID claimed by the wrong person":
    "Un WOS ID reclamado por la persona equivocada",
  "Under Release a claimed WOS ID, enter the ID. It is removed from the login that claimed it so the real player can add it.":
    "En Liberar un WOS ID reclamado, introduce el ID. Se quita del usuario que lo reclamó para que el jugador real pueda añadirlo.",
  "Notices and tags":
    "Avisos y etiquetas",
  "Send notices to the whole state, one alliance or everyone with a tag. Tags are for your own groupings; rally and hero tags are created automatically when you publish.":
    "Envía avisos a todo el estado, a una alianza o a todos los que tengan una etiqueta. Las etiquetas son para tus propios grupos; las de rally y héroe se crean solas al publicar.",
  "My WOS ID is already registered.":
    "Mi WOS ID ya está registrado.",
  "Someone else claimed it. Ask an admin of your state to release it, then add it again.":
    "Otra persona lo reclamó. Pide a un administrador de tu estado que lo libere y vuelve a añadirlo.",
  "My power or Furnace is out of date.":
    "Mi poder o mi Horno están desactualizados.",
  "Press Refresh player data on Account (once a day). Everyone is also refreshed every Monday.":
    "Pulsa Actualizar datos del jugador en Cuenta (una vez al día). Además, todos se actualizan cada lunes.",
  "I can't see Live Battle.":
    "No veo Batalla en vivo.",
  "The times look wrong.":
    "Las horas parecen incorrectas.",
  "Every time in Overwatch is UTC, like the game's SvS. In Live Battle, press Resync clock.":
    "Todas las horas en Overwatch están en UTC, como la SvS del juego. En Batalla en vivo, pulsa Resincronizar reloj.",
  "I don't get send alerts on my phone.":
    "No me llegan las alertas de envío al móvil.",
  "Allow notifications for this site in your browser, keep the Garrison page open and the screen on during the battle.":
    "Permite las notificaciones de este sitio en tu navegador y mantén abierta la página de Guarnición y la pantalla encendida durante la batalla.",
  "Is the demo safe to try?":
    "¿Es seguro probar la demo?",
  "Yes. It runs only in your browser with fake players. Nothing is saved to any state, and Reset demo starts it over.":
    "Sí. Funciona solo en tu navegador con jugadores ficticios. No se guarda nada en ningún estado, y Reiniciar demo la empieza de nuevo.",
  "Your SvS plans itself":
    "Tu SvS se planifica sola",
  "The moment the draw is out, Overwatch creates the plan, reminds members to vote, builds the rallies from who can play and publishes them. Admins only review.":
    "En cuanto sale el sorteo, Overwatch crea el plan, recuerda a los miembros que voten, arma los rallies según quién puede jugar y los publica. Los administradores solo revisan.",
  "Land between enemy rallies":
    "Llega entre rallies enemigos",
  "Every garrison player gets a personal countdown that tells them exactly when to send, so reinforcements arrive between enemy hits, or right after the last one.":
    "Cada jugador de guarnición tiene su propia cuenta atrás que le dice exactamente cuándo enviar, para que los refuerzos lleguen entre golpes enemigos, o justo después del último.",
  "One shared battle clock":
    "Un único reloj de batalla compartido",
  "Every phone and PC times against the same server clock, so a device that is a few seconds off still sends on the right second.":
    "Todos los móviles y PC se sincronizan con el mismo reloj del servidor, así que un dispositivo con unos segundos de desfase envía igualmente en el segundo exacto.",
  "Rallies built the smart way":
    "Rallies armados con inteligencia",
  "Formations, four unique joiner heroes per rally, and only players who own each hero at 4★. Auto-fill balances power and follows your priorities.":
    "Formaciones, cuatro héroes de apoyo distintos por rally y solo jugadores que tienen cada héroe con 4★. El autorrelleno equilibra el poder y sigue tus prioridades.",
  "Know your opponent":
    "Conoce a tu rival",
  "Their strongest players, alliances and SvS record, refreshed daily from WOSOracle. Enemy leaders and their coordinates are remembered between battles.":
    "Sus jugadores más fuertes, alianzas e historial de SvS, actualizados a diario desde WOSOracle. Los líderes enemigos y sus coordenadas se recuerdan entre batallas.",
  "Everyone knows where to be":
    "Todos saben dónde estar",
  "“Hi Frost, you're in Ted's rally with Jessie and 50/20/30.” Every member gets their assignment, every change, and Victory or Defeat afterwards.":
    "“Hola Frost, estás en el rally de Ted con Jessie y 50/20/30.” Cada miembro recibe su asignación, cada cambio y la Victoria o Derrota al final.",
  "Draw":
    "Sorteo",
  "Plan created, members told":
    "Plan creado, miembros avisados",
  "T−30 h":
    "T−30 h",
  "Reminder to vote":
    "Recordatorio para votar",
  "T−24 h":
    "T−24 h",
  "Rallies built and filled":
    "Rallies creados y llenos",
  "T−6 h":
    "T−6 h",
  "Published to every member":
    "Publicado para cada miembro",
  "17:00 UTC":
    "17:00 UTC",
  "Victory or Defeat for all":
    "Victoria o Derrota para todos",
  "Vote once, see your rally, hero and formation, and get told about every change.":
    "Vota una vez, consulta tu rally, héroe y formación, y entérate de cada cambio.",
  "Enter your city once. A countdown and an alert tell you the exact second to send.":
    "Introduce tu ciudad una vez. Una cuenta atrás y una alerta te dicen el segundo exacto para enviar.",
  "Pick enemy leaders from the opponent's strongest players and call each rally with one tap.":
    "Elige líderes enemigos entre los jugadores más fuertes del rival y registra cada rally con un toque.",
  "A checklist for the next SvS, automation that does the busywork, and full control when you want it.":
    "Una lista de pasos para la próxima SvS, automatización que hace el trabajo pesado y control total cuando lo quieras.",
  "Is the demo really free?":
    "¿La demo es gratis de verdad?",
  "Yes. It needs no account, uses a fake state with fake players, and lives only in your browser: nothing is saved anywhere.":
    "Sí. No necesita cuenta, usa un estado ficticio con jugadores ficticios y vive solo en tu navegador: no se guarda nada en ningún sitio.",
  "Where does the game data come from?":
    "¿De dónde salen los datos del juego?",
  "Player stats, SvS draws, results and opponent intel come from WOSOracle. Members only type their WOS ID.":
    "Las estadísticas de jugadores, los sorteos de SvS, los resultados y la información del rival vienen de WOSOracle. Los miembros solo escriben su WOS ID.",
  "Does it work on phones?":
    "¿Funciona en móviles?",
  "Yes. Overwatch is built for phones first, with a tab bar at the bottom and big buttons for battle time.":
    "Sí. Overwatch está pensado primero para móviles, con una barra de pestañas abajo y botones grandes para la hora de la batalla.",
  "How does my state get started?":
    "¿Cómo empieza mi estado?",
  "Your state owner signs up and gets the state set up. After that, members join by adding their WOS ID: the join request goes to the owner and admins automatically.":
    "El propietario de tu estado se registra y configura el estado. Después, los miembros se unen añadiendo su WOS ID: la solicitud de unión llega automáticamente al propietario y a los administradores.",
  "Which languages are supported?":
    "¿Qué idiomas hay?",
  "English, العربية, ไทย, 简体中文 and Español.":
    "English, العربية, ไทย, 简体中文 y Español.",
  "For Whiteout Survival SvS states":
    "Para estados de SvS de Whiteout Survival",
  "Your whole SvS, planned and timed for you.":
    "Toda tu SvS, planificada y cronometrada para ti.",
  "Overwatch reads the draw, builds your rallies from who can play, tells every member where to be, and counts down to the second when to send reinforcements.":
    "Overwatch lee el sorteo, arma tus rallies según quién puede jugar, dice a cada miembro dónde estar y cuenta hasta el segundo exacto para enviar refuerzos.",
  "Try the free demo":
    "Prueba la demo gratis",
  "Free demo · No account needed · Nothing leaves your browser":
    "Demo gratis · Sin cuenta · Nada sale de tu navegador",
  "Live":
    "En vivo",
  "Send reinforcements in":
    "Envía refuerzos en",
  "Your garrison lands":
    "Tu guarnición llega",
  "Draw: vs state 1234":
    "Sorteo: contra el estado 1234",
  "41/48 voted":
    "41/48 votaron",
  "Live data from WOSOracle":
    "Datos en vivo de WOSOracle",
  "Works on any phone":
    "Funciona en cualquier móvil",
  "5 languages":
    "5 idiomas",
  "All times in UTC":
    "Todas las horas en UTC",
  "The best parts":
    "Lo mejor",
  "Less admin work, sharper battles":
    "Menos trabajo de gestión, batallas más precisas",
  "How an SvS runs":
    "Cómo funciona una SvS",
  "From the draw to the result, on autopilot":
    "Del sorteo al resultado, en piloto automático",
  "See it with a fake state, free":
    "Pruébalo con un estado ficticio, gratis",
  "The demo gives you a state with 40 players, an SvS draw and an opponent. Start the battle whenever you like, switch between the admin and member view, and try every tool.":
    "La demo te da un estado con 40 jugadores, un sorteo de SvS y un rival. Empieza la batalla cuando quieras, cambia entre la vista de administrador y de miembro, y prueba todas las herramientas.",
  "Open the demo":
    "Abrir la demo",
  "For everyone in your state":
    "Para todos en tu estado",
  "Each role gets exactly what it needs":
    "Cada rol tiene justo lo que necesita",
  "Questions":
    "Preguntas",
  "Good to know":
    "Bueno saberlo",
  "Every feature is explained step by step in the guides.":
    "Cada función se explica paso a paso en las guías.",
  "Read the guides":
    "Leer las guías",
  "Ready for your next SvS?":
    "¿Listo para tu próxima SvS?",
  "Footer":
    "Pie de página",
  "Guides":
    "Guías",
  "Free demo":
    "Demo gratis",
  "A fan-made companion tool for Whiteout Survival. Not affiliated with Century Games.":
    "Una herramienta de apoyo hecha por fans para Whiteout Survival. Sin relación con Century Games.",
  "How Overwatch works":
    "Cómo funciona Overwatch",
  "Everything from your first sign-in to calling rallies in a live battle. Pick your part below.":
    "Todo, desde tu primer inicio de sesión hasta registrar rallies en una batalla en vivo. Elige tu parte abajo.",
  "On this page":
    "En esta página",
  "Common questions":
    "Preguntas frecuentes",
  "Try every tool in the demo: no account needed, nothing leaves your browser.":
    "Prueba todas las herramientas en la demo: sin cuenta y nada sale de tu navegador.",
  "Welcome back": "Bienvenido de nuevo",
  "Join your state": "Únete a tu estado",
  "Sign in to see your SvS, your rally and your send times.":
    "Inicia sesión para ver tu SvS, tu rally y tus horas de envío.",
  "Create an account with your WOS ID; your state's admins get your join request automatically.":
    "Crea una cuenta con tu WOS ID; los admins de tu estado reciben tu solicitud automáticamente.",
  "State management": "Gestión del estado",
  "Members, alliances and how the automation prepares each SvS. Planning and battles run by themselves.":
    "Miembros, alianzas y cómo la automatización prepara cada SvS. La planificación y las batallas funcionan solas.",
  "Rally from {name} called.": "Rally de {name} registrado.",
  "Cancel the rally from {name} for everyone?":
    "¿Cancelar el rally de {name} para todos?",
  "Pick the opponent's players below. Their coordinates are remembered: next battle they are prefilled, and leaders you added before are listed automatically when the battle starts.":
    "Elige abajo a los jugadores del rival. Sus coordenadas se recuerdan: en la próxima batalla se rellenan solas y los líderes que añadiste antes aparecen automáticamente al empezar.",
  "Coordinates from the last battle against this player.":
    "Coordenadas de la última batalla contra este jugador.",
  "You have not joined a state yet. When the state of your WOS account uses WOSOverwatch, a join request is sent automatically; you get a notification when an admin approves it.":
    "Aún no te has unido a un estado. Cuando el estado de tu cuenta WOS use WOSOverwatch, se envía una solicitud automáticamente; recibirás una notificación cuando un admin la apruebe.",
  "That username may already be registered.":
    "Ese nombre de usuario puede estar ya registrado.",
  "Review rallies": "Revisar rallies",
  "Vote now": "Votar ahora",
  "Invitation delivered in the player's notification inbox.":
    "Invitación entregada en la bandeja de notificaciones del jugador.",
  "Filled in from the owner's WOS account; used to look up your SvS opponent and battle time on WOSOracle. Only the owner can change it.":
    "Se rellena desde la cuenta WOS del dueño; sirve para buscar tu rival y hora de SvS en WOSOracle. Solo el dueño puede cambiarlo.",
  "Publish now? Every member gets their rally assignment.":
    "¿Publicar ahora? Cada miembro recibe su asignación de rally.",
  "Published. Every member got their assignment.":
    "Publicado. Cada miembro recibió su asignación.",
  "{rallies} rallies created, {players} players added.":
    "{rallies} rallies creados, {players} jugadores añadidos.",
  "Earlier plans ({count})": "Planes anteriores ({count})",
  "Delete the “{name}” tag? It is removed from {count} WOS accounts.":
    "¿Eliminar la etiqueta “{name}”? Se quita de {count} cuentas WOS.",
  "Labels for announcements and your own groupings. Rally and hero tags are created automatically from the published plan.":
    "Etiquetas para anuncios y tus propios grupos. Las de rally y héroe se crean solas desde el plan publicado.",
  "Create a tag above, then add players to it.":
    "Crea una etiqueta arriba y luego añade jugadores.",
  "Managed in Planning": "Se gestiona en Planificación",
  "Run the latest database migration to use automatic planning.":
    "Ejecuta la última migración de la base de datos para usar la planificación automática.",
  "Automation saved.": "Automatización guardada.",
  "SvS automation": "Automatización SvS",
  "Set up and fill rallies automatically":
    "Armar y llenar rallies automáticamente",
  "Publish automatically 6 hours before the battle":
    "Publicar automáticamente 6 horas antes de la batalla",
  "Number of rallies": "Número de rallies",
  "Players per rally (with leader)": "Jugadores por rally (con líder)",
  "Default formation (Inf/Lan/Mark %)": "Formación por defecto (Inf/Lan/Tir %)",
  "Default joiner heroes for every rally":
    "Héroes de unión por defecto en cada rally",
  None: "Ninguno",
  "Draw: vs state {opponent}": "Sorteo: contra el estado {opponent}",
  "SvS plan created": "Plan SvS creado",
  "Battle {time} (12:00–17:00 UTC).": "Batalla {time} (12:00–17:00 UTC).",
  "Attendance: {voted}/{total} voted, {available} can play":
    "Asistencia: {voted}/{total} votaron, {available} pueden jugar",
  "Members who had not voted were reminded.":
    "Se recordó a quienes no habían votado.",
  "Members who have not voted are reminded at {time}.":
    "Se recordará a quienes no votaron el {time}.",
  "Rallies: {rallies} with {players} players":
    "Rallies: {rallies} con {players} jugadores",
  "Rallies: not generated yet": "Rallies: aún no generados",
  "Generated automatically at {time} from your Rally Leads and best Labyrinth players, then filled by your auto-fill priorities.":
    "Se generan solos el {time} con tus líderes de rally y los mejores del Laberinto, y se llenan según tus prioridades de autollenado.",
  "Automatic rallies are off for this state.":
    "Los rallies automáticos están desactivados en este estado.",
  "Generate now": "Generar ahora",
  "Not published yet": "Aún no publicado",
  "Every member got their rally, hero and formation.":
    "Cada miembro recibió su rally, héroe y formación.",
  "{count} rallies have no destination alliance.":
    "{count} rallies no tienen alianza de destino.",
  "Published automatically at {time}.": "Se publica automáticamente el {time}.",
  "Automatic publishing is off: publish when ready.":
    "La publicación automática está desactivada: publica cuando esté listo.",
  "Publish now": "Publicar ahora",
  "Next SvS": "Próxima SvS",
  "Can you join the SvS?": "¿Puedes unirte a la SvS?",
  "Rallies are ready for review": "Los rallies están listos para revisar",
  "Total power": "Poder total",
  "SvS opponent drawn": "Rival de SvS sorteado",
  "Comments & notices": "Comentarios y avisos",
  "{player}: vote whether you can join {plan} so you get a rally spot.":
    "{player}: vota si puedes unirte a {plan} para tener un lugar en un rally.",
  "{rallies} rallies with {players} players were set up for {plan}.":
    "Se armaron {rallies} rallies con {players} jugadores para {plan}.",
  "They are published automatically at {time}.":
    "Se publican automáticamente el {time}.",
  "Publish them from Planning.": "Publícalos desde Planificación.",
  Add: "Añadir",
  "Player data synchronized. A request to join {state} was sent; an owner or admin will review it.":
    "Datos del jugador sincronizados. Se envió una solicitud para unirse a {state}; un dueño o admin la revisará.",
  "Player data synchronized. Your request to join {state} is waiting for review.":
    "Datos del jugador sincronizados. Tu solicitud para unirte a {state} está pendiente de revisión.",
  "Player data synchronized. You have an invitation to {state}: accept it in Notifications.":
    "Datos del jugador sincronizados. Tienes una invitación a {state}: acéptala en Notificaciones.",
  "Join request: {player}": "Solicitud de ingreso: {player}",
  "{player} (WOS ID {wosId}) wants to join {state}. Review the request in State management.":
    "{player} (WOS ID {wosId}) quiere unirse a {state}. Revisa la solicitud en Gestión del estado.",
  "Join request sent": "Solicitud de ingreso enviada",
  "{player} is in state {number}, so a request to join {state} was sent. An owner or admin will review it.":
    "{player} está en el estado {number}, así que se envió una solicitud para unirse a {state}. Un dueño o admin la revisará.",
  "End battle as a win": "Terminar la batalla con victoria",
  "End battle as a loss": "Terminar la batalla con derrota",
  Victory: "Victoria",
  Defeat: "Derrota",
  "Rally assignment": "Asignación de rally",
  Role: "Rol",
  Removed: "Eliminado",
  All: "Todas",
  Results: "Resultados",
  "Battles & rallies": "Batallas y rallies",
  "Your account": "Tu cuenta",
  "No notifications in this filter.": "No hay notificaciones en este filtro.",
  "Battle results, rally assignments and everything an admin changes on your accounts appear here, colour-coded by action.":
    "Aquí aparecen los resultados de batalla, las asignaciones de rally y todo lo que un admin cambia en tus cuentas, con un color por tipo de acción.",
  "your state": "tu estado",
  "Victory! We won against State {opponent}":
    "¡Victoria! Ganamos contra el estado {opponent}",
  "Victory! We won": "¡Victoria! Hemos ganado",
  "Defeat against State {opponent}": "Derrota contra el estado {opponent}",
  "Hi {player}, {state} won {battle}. Thank you for fighting!":
    "Hola {player}, {state} ganó {battle}. ¡Gracias por luchar!",
  "Hi {player}, {state} lost {battle}. Thank you for fighting, we regroup for the next SvS.":
    "Hola {player}, {state} perdió {battle}. Gracias por luchar, nos reagrupamos para la próxima SvS.",
  "Battle over": "Batalla terminada",
  "{battle} has ended. The win or loss follows as soon as the result is in.":
    "{battle} ha terminado. La victoria o derrota llegará en cuanto haya resultado.",
  "Battle cancelled": "Batalla cancelada",
  "{battle} was cancelled.": "{battle} fue cancelada.",
  "Promoted to {role}": "Ascendido a {role}",
  "Role changed to {role}": "Rol cambiado a {role}",
  "{player} is now {role} of {state} (was {oldRole}).":
    "{player} ahora es {role} de {state} (antes {oldRole}).",
  "Removed from {state}": "Eliminado de {state}",
  "{player} was removed from {state} by an admin.":
    "Un admin eliminó a {player} de {state}.",
  "New permission: {capability}": "Nuevo permiso: {capability}",
  "{player} can now use {capability} in {state}.":
    "{player} ahora puede usar {capability} en {state}.",
  "Permission removed: {capability}": "Permiso retirado: {capability}",
  "{player} can no longer use {capability} in {state}.":
    "{player} ya no puede usar {capability} en {state}.",
  "You are a Rally Lead": "Eres líder de rally",
  "New tag: {tag}": "Nueva etiqueta: {tag}",
  "{player} gained the {tag} tag in {state}.":
    "{player} obtuvo la etiqueta {tag} en {state}.",
  "Tag removed: {tag}": "Etiqueta retirada: {tag}",
  "{player} lost the {tag} tag in {state}.":
    "{player} perdió la etiqueta {tag} en {state}.",
  "an alliance": "una alianza",
  "Moved to {alliance}": "Movido a {alliance}",
  "Assigned to {alliance}": "Asignado a {alliance}",
  "{player} is now in {alliance} in {state}.":
    "{player} ahora está en {alliance} en {state}.",
  "Removed from {alliance}": "Eliminado de {alliance}",
  "{player} is no longer assigned to {alliance} in {state}.":
    "{player} ya no está asignado a {alliance} en {state}.",
  "an alliance not yet selected": "una alianza aún sin elegir",
  "You lead a rally": "Lideras un rally",
  "Hi {player}, you're leading {group} in {alliance}. Please be there by battle start ({start}).":
    "Hola {player}, lideras {group} en {alliance}. Por favor, llega antes del inicio de la batalla ({start}).",
  "You're joining with {hero} and {formation} formation.":
    "Te unes con {hero} y formación {formation}.",
  "You're joining with {hero}.": "Te unes con {hero}.",
  "Use {formation} formation.": "Usa la formación {formation}.",
  "Your rally assignment changed": "Tu asignación de rally cambió",
  "Your rally assignment": "Tu asignación de rally",
  "Hi {player}, you've been assigned to {group} in {alliance}.":
    "Hola {player}, te asignaron a {group} en {alliance}.",
  "Please be there by battle start ({start}).":
    "Por favor, llega antes del inicio de la batalla ({start}).",
  "Removed from {group}": "Eliminado de {group}",
  "Hi {player}, you are no longer in {group} for {plan} ({start}).":
    "Hola {player}, ya no estás en {group} para {plan} ({start}).",
  "{plan} was published for {start}. This account is not assigned to a rally.":
    "{plan} se publicó para {start}. Esta cuenta no está asignada a ningún rally.",
  "after the last rally": "después del último rally",
  "Land right after {name} hits at {impact} UTC.":
    "Llega justo después del impacto de {name} a las {impact} UTC.",
  "Land right after {name} hits.": "Llega justo después del impacto de {name}.",
  "No landing windows yet. A window appears as soon as an enemy rally is called.":
    "Aún no hay ventanas de llegada. Aparece una en cuanto se llama un rally enemigo.",
  Garrison: "Guarnición",
  "No SvS plan": "Sin plan de SvS",
  "Create the SvS plan": "Crear el plan de SvS",
  "There is no upcoming battle plan. It is normally created automatically from the SvS draw; if it was deleted, create it again here. A state can only have one upcoming plan.":
    "No hay ningún plan de batalla próximo. Normalmente se crea automáticamente a partir del sorteo de SvS; si se eliminó, créalo de nuevo aquí. Un estado solo puede tener un plan próximo.",
  "Battle date (12:00–17:00 UTC)": "Fecha de batalla (12:00–17:00 UTC)",
  "Create SvS plan": "Crear plan de SvS",
  "SvS plan created.": "Plan de SvS creado.",
  Alliances: "Alianzas",
  "Has the rally's joiner heroes": "Tiene los héroes de apoyo del rally",
  "Has none of this rally's joiner heroes at 4★.":
    "No tiene ninguno de los héroes de apoyo de este rally con 4★.",
  "Heroes unknown: ask them to fill in their heroes.":
    "Héroes desconocidos: pídele que rellene sus héroes.",
  "Heroes assigned in {group}: {covered} of {total} joiner heroes covered.":
    "Héroes asignados en {group}: {covered} de {total} héroes de apoyo cubiertos.",
  "Assign heroes": "Asignar héroes",
  "Pick an enemy rally leader": "Elige un líder de rally enemigo",
  "Load their top players": "Cargar sus mejores jugadores",
  "Their {count} strongest players": "Sus {count} jugadores más fuertes",
  "Not in the top {count}? Search an alliance roster":
    "¿No está en el top {count}? Busca en la lista de una alianza",
  "Add a priority": "Añadir una prioridad",
  "Add from WOSOracle": "Añadir desde WOSOracle",
  "Add manually": "Añadir manualmente",
  Added: "Añadida",
  "Alliance ID": "ID de alianza",
  "Alliance added. It can now be selected in Battle Planning.":
    "Alianza añadida. Ya se puede elegir en la planificación.",
  "Battle half": "Mitad de la batalla",
  "Clear selection": "Quitar selección",
  "Each joiner hero can only be used once per rally.":
    "Cada héroe de apoyo solo se puede usar una vez por rally.",
  "Enter a numeric alliance ID.": "Introduce un ID de alianza numérico.",
  "Equal power across rallies": "Poder igualado entre rallies",
  "FC level": "Nivel FC",
  "Formation (Inf/Lan/Mark %)": "Formación (Inf/Lan/Tir %)",
  "Formation:": "Formación:",
  "Four unique joiner heroes. Each member brings one of them.":
    "Cuatro héroes de apoyo distintos. Cada miembro lleva uno de ellos.",
  "Heroes saved.": "Héroes guardados.",
  "Heroes unknown": "Héroes desconocidos",
  "Highest FC": "FC más alto",
  "Highest Labyrinth": "Laberinto más alto",
  "Highest power": "Poder más alto",
  "Highest troop tier": "Nivel de tropa más alto",
  "Join with:": "Únete con:",
  "Joiner hero {number}": "Héroe de apoyo {number}",
  "Joiner heroes at 4★ or higher": "Héroes de apoyo con 4★ o más",
  "Joins with": "Se une con",
  Labyrinth: "Laberinto",
  "Last updated {date}": "Última actualización {date}",
  "Load your state's alliances": "Cargar las alianzas de tu estado",
  "Look up": "Buscar",
  "Move down": "Bajar",
  "Move up": "Subir",
  "Move {count} selected to…": "Mover {count} seleccionados a…",
  "No 4★ joiner heroes": "Sin héroes de apoyo 4★",
  "No hero yet": "Sin héroe aún",
  "Not assigned yet": "Aún sin asignar",
  "Not filled in yet": "Aún sin rellenar",
  "Not set": "Sin configurar",
  "Rally setup": "Configurar rally",
  "Save heroes": "Guardar héroes",
  "Save rally setup": "Guardar configuración",
  "Select all shown": "Seleccionar todos los mostrados",
  "Sort by": "Ordenar por",
  "Tick every hero you have at 4 stars or more. Admins use this to give you a hero to join rallies with.":
    "Marca cada héroe que tengas con 4 estrellas o más. Los administradores lo usan para darte un héroe con el que unirte a los rallies.",
  "Troop tier": "Nivel de tropa",
  "Update them on your account page": "Actualízalos en tu página de cuenta",
  "Use Infantry/Lancer/Marksman percentages that add up to 100, like 50/20/30.":
    "Usa porcentajes de Infantería/Lancero/Tirador que sumen 100, como 50/20/30.",
  "Voice call first": "Chat de voz primero",
  "WOSOracle could not be reached.": "No se pudo contactar con WOSOracle.",
  "WOSOracle lists no alliances for your state yet.":
    "WOSOracle aún no lista alianzas para tu estado.",
  "WOSOracle lists only your state's strongest alliances. Add shell alliances by their alliance ID, or type a name below.":
    "WOSOracle solo lista las alianzas más fuertes de tu estado. Añade alianzas vacías por su ID o escribe un nombre abajo.",
  "Your 4★ joiner heroes are not filled in yet.":
    "Aún no has rellenado tus héroes de apoyo 4★.",
  "{count} heroes": "{count} héroes",
  "{count} members": "{count} miembros",
  "Exit demo": "Salir de la demo",
  "Fake players and data that live only in this browser. Nothing is saved to your state.":
    "Jugadores y datos falsos que solo existen en este navegador. Nada se guarda en tu estado.",
  "Private demo": "Demo privada",
  "Reset demo": "Reiniciar demo",
  "Reset the demo to its starting data?":
    "¿Reiniciar la demo con los datos iniciales?",
  "Start the battle now": "Empezar la batalla ahora",
  "Try the private demo": "Probar la demo privada",
  "Want to look around first? The private demo has fake players and a fake SvS, lives only in your browser and never touches real data.":
    "¿Quieres echar un vistazo primero? La demo privada tiene jugadores y un SvS falsos, vive solo en tu navegador y nunca toca datos reales.",
  "Hero generation": "Generación de héroes",
  "Hero generation saved.": "Generación de héroes guardada.",
  "Not set (show all heroes)": "Sin configurar (mostrar todos)",
  "The newest hero generation your state has unlocked. Heroes from later generations are hidden in Tags.":
    "La generación de héroes más reciente que ha desbloqueado tu estado. Los héroes de generaciones posteriores se ocultan en Etiquetas.",
  "All tags": "Todas las etiquetas",
  Epic: "Épico",
  "Gen {number}": "Gen {number}",
  Rare: "Raro",
  Regular: "Normal",
  "Add player": "Añadir jugador",
  "Automatic: leader’s rally tag": "Automática: etiqueta del rally del líder",
  "Choose a player": "Elige un jugador",
  Hero: "Héroe",
  "Join with: {hero}": "Únete con: {hero}",
  "No players have this tag.": "Ningún jugador tiene esta etiqueta.",
  Rally: "Rally",
  "Rally tags are also given to the whole group when the battle plan is published.":
    "Las etiquetas de rally también se dan a todo el grupo cuando se publica el plan.",
  "Delete plan": "Eliminar plan",
  "Delete “{name}”, every group in it and its upcoming battle? Finished battles stay in the history.":
    "¿Eliminar «{name}», todos sus grupos y su próxima batalla? Las batallas terminadas se quedan en el historial.",
  Lab: "Lab",
  "No Labyrinth scores yet. They appear after members' accounts are synced.":
    "Aún no hay puntuaciones de Laberinto. Aparecen cuando se sincronizan las cuentas de los miembros.",
  "Expected draw {date}.": "Sorteo previsto {date}.",
  "Next battle {date}.": "Próxima batalla {date}.",
  "Start (UTC)": "Inicio (UTC)",
  "SvS draw {when}": "Sorteo de SvS {when}",
  "SvS vs state {opponent} {when}": "SvS contra el estado {opponent} {when}",
  "WOSOracle expected the draw {date} but has not published it yet. Checked every hour until it appears.":
    "WOSOracle esperaba el sorteo {date} pero aún no lo ha publicado. Se comprueba cada hora hasta que aparezca.",
  "Waiting for the SvS draw": "Esperando el sorteo de SvS",
  "in {days} days": "en {days} días",
  "in {hours} hours": "en {hours} horas",
  "within the hour": "en menos de una hora",
  intel: "Inteligencia",
  "Any availability": "Cualquier disponibilidad",
  Attendance: "Asistencia",
  "Battle losses": "Batallas perdidas",
  "Battle wins": "Batallas ganadas",
  "Can't join": "No puedo",
  "Castles lost": "Castillos perdidos",
  "Castles taken": "Castillos tomados",
  "Combined power of the top alliances: them {them}, us {us}.":
    "Poder combinado de las mejores alianzas: ellos {them}, nosotros {us}.",
  "Data from WOSOracle, updated {date}.":
    "Datos de WOSOracle, actualizados {date}.",
  "First half": "Primera mitad",
  "I can join voice call": "Puedo unirme al chat de voz",
  "Intel appears automatically once the SvS opponent is drawn.":
    "La información aparece automáticamente cuando se sortea el rival de SvS.",
  "Loading intel...": "Cargando información...",
  "No player data yet.": "Aún no hay datos de jugadores.",
  "Not answered": "Sin responder",
  "Opponent intel": "Información del rival",
  "Our state": "Nuestro estado",
  "Pick an option to answer.": "Elige una opción para responder.",
  Prep: "Preparación",
  "Prep losses": "Preparaciones perdidas",
  "Prep wins": "Preparaciones ganadas",
  "Second half": "Segunda mitad",
  "State rankings": "Clasificaciones del estado",
  "Thanks — your availability is saved.":
    "Gracias: tu disponibilidad se guardó.",
  "The opponent is drawn but intel has not been collected yet. It appears after the next automatic WOSOracle check.":
    "El rival está sorteado pero aún no se ha recopilado información. Aparecerá tras la próxima comprobación automática de WOSOracle.",
  "Their SvS record": "Su historial de SvS",
  "Their strongest players": "Sus jugadores más fuertes",
  "Top alliances": "Mejores alianzas",
  Voice: "Voz",
  "Voice call only": "Solo chat de voz",
  "When can you play SvS vs state {opponent}?":
    "¿Cuándo puedes jugar el SvS contra el estado {opponent}?",
  "When can you play the next SvS?": "¿Cuándo puedes jugar el próximo SvS?",
  "Whole battle": "Toda la batalla",
  "You answered. Tap another option to change it.":
    "Ya respondiste. Toca otra opción para cambiarla.",
  "rank {rank} of {total}": "puesto {rank} de {total}",
  lost: "perdida",
  won: "ganada",
  "{count} of your state answered, {voice} can join voice.":
    "{count} de tu estado respondieron, {voice} pueden unirse a voz.",
  "{count} players": "{count} jugadores",
  "Battle starts {date}.": "La batalla empieza {date}.",
  "Check WOSOracle now": "Comprobar WOSOracle ahora",
  "Checking...": "Comprobando...",
  "Last checked {date}.": "Última comprobación {date}.",
  "Not checked with WOSOracle yet.": "Aún no se ha comprobado con WOSOracle.",
  "Plans and battles are created, started and ended automatically from the WOSOracle draw.":
    "Los planes y batallas se crean, empiezan y terminan automáticamente según el sorteo de WOSOracle.",
  "Player data was refreshed in the last 24 hours. It also updates automatically every week.":
    "Los datos del jugador se actualizaron en las últimas 24 horas. También se actualizan automáticamente cada semana.",
  "Set the in-game state number on State management.":
    "Configura el número de estado del juego en Gestión del estado.",
  "SvS battle vs state {opponent} is live":
    "La batalla SvS contra el estado {opponent} está en curso",
  "SvS status unknown": "Estado de SvS desconocido",
  "The check failed.": "La comprobación falló.",
  "WOSOracle checked.": "WOSOracle comprobado.",
  " — from the SvS draw": " — del sorteo de SvS",
  " — from the battle plan": " — del plan de batalla",
  "(Leader)": "(Líder)",
  "Auto from battle plan": "Automático desde el plan",
  "Enter a valid state number.": "Introduce un número de estado válido.",
  "In-game state": "Estado del juego",
  "In-game state number saved.": "Número de estado guardado.",
  "Only the state owner can change this.":
    "Solo el propietario del estado puede cambiar esto.",
  "Opponent state": "Estado rival",
  "Picked from WOSOracle: [{abbr}] {name}. Enter their coordinates below.":
    "Elegido de WOSOracle: [{abbr}] {name}. Introduce sus coordenadas abajo.",
  "Search player": "Buscar jugador",
  "Select alliance": "Seleccionar alianza",
  "State number": "Número de estado",
  "State {opponent}": "Estado {opponent}",
  "The opponent could not be loaded.": "No se pudo cargar el rival.",
  "The roster could not be loaded.": "No se pudo cargar la lista.",
  Use: "Usar",
  "vs state {opponent}": "vs estado {opponent}",
  "Battle clock not synchronized yet — using this device's clock.":
    "Reloj de batalla aún no sincronizado: se usa el reloj de este dispositivo.",
  "Battle clock synchronized (±{accuracy} ms).":
    "Reloj de batalla sincronizado (±{accuracy} ms).",
  "Enter the time shown in game, then press Call rally the moment the in-game timer changes to that value. Every second of delay shifts the whole schedule.":
    "Introduce el tiempo que muestra el juego y pulsa Llamar rally justo cuando el temporizador del juego cambie a ese valor. Cada segundo de retraso desplaza todo el horario.",
  "Land between {first} and {second}.": "Llega entre {first} y {second}.",
  "Land between {opens} and {closes} UTC ({seconds} s gap).":
    "Llega entre {opens} y {closes} UTC (margen de {seconds} s).",
  "Resync clock": "Resincronizar reloj",
  "Send early (ms)": "Enviar antes (ms)",
  "Send early compensates for your game ping: if the game lags on your connection, add your ping here.":
    "Enviar antes compensa tu ping en el juego: si el juego va con retraso en tu conexión, añade tu ping aquí.",
  "Under one second between these rallies — very hard to hit.":
    "Menos de un segundo entre estos rallies: muy difícil de acertar.",
  "When to send": "Cuándo enviar",
  "Window {number}": "Ventana {number}",
  impact: "impacto",
  "Claimed WOS ID": "WOS ID reclamado",
  "If someone registered a WOS ID that is not theirs, release it so the real player can add it. Works for members of this state and for players WOSOracle lists in your in-game state.":
    "Si alguien registró un WOS ID que no es suyo, libéralo para que el jugador real pueda añadirlo. Funciona para miembros de este estado y para jugadores que WOSOracle muestra en tu estado del juego.",
  "Release WOS ID": "Liberar WOS ID",
  "Release WOS ID {wosId}? It is removed from the login that claimed it, including all state memberships, so the real player can register it.":
    "¿Liberar el WOS ID {wosId}? Se eliminará de la cuenta que lo reclamó, incluidas todas sus membresías de estado, para que el jugador real pueda registrarlo.",
  "Release a claimed WOS ID": "Liberar un WOS ID reclamado",
  "Releasing...": "Liberando...",
  "That WOS ID is already registered. If it is yours, ask an admin of your state to release it.":
    "Ese WOS ID ya está registrado. Si es tuyo, pide a un administrador de tu estado que lo libere.",
  "The WOS ID could not be released.": "No se pudo liberar el WOS ID.",
  "WOS ID {wosId} was released.": "El WOS ID {wosId} fue liberado.",
  "— March:": "— Marcha:",
  "/2000 characters": "/2000 caracteres",
  Accept: "Aceptar",
  Account: "Cuenta",
  "Active announcements": "Anuncios activos",
  "Add a public comment": "Añadir un comentario público",
  "Add another WOS account": "Añadir otra cuenta de WOS",
  "Add leader": "Añadir líder",
  "Add WOS account": "Añadir cuenta de WOS",
  "Automatic player data has not been synchronized yet.":
    "Los datos automáticos del jugador aún no se han sincronizado.",
  Admin: "Administrador",
  "Admin access required": "Se necesita acceso de administrador",
  Admins: "Administradores",
  Alliance: "Alianza",
  "Alliance capacity must be between 1 and 100.":
    "La capacidad de la alianza debe estar entre 1 y 100.",
  "Alliance created. It can now be selected in Battle Planning.":
    "Alianza creada. Ya puede seleccionarse en la planificación de batalla.",
  "Alliance deleted. No state members were removed.":
    "Alianza eliminada. No se eliminó ningún miembro del estado.",
  "Alliance name": "Nombre de la alianza",
  "Alliance overview": "Resumen de alianzas",
  "Alliance rosters become visible after membership approval.":
    "Las listas de alianzas estarán visibles después de aprobar la membresía.",
  "Alliance setup": "Configuración de alianzas",
  "Alliance updated.": "Alianza actualizada.",
  "Alliance:": "Alianza:",
  "An Owner or Admin can create alliances from Manage State.":
    "Un propietario o administrador puede crear alianzas desde Administrar estado.",
  "Announcement deleted.": "Anuncio eliminado.",
  "Announcement sent.": "Anuncio enviado.",
  "Announcements sent to this account will appear here.":
    "Los anuncios enviados a esta cuenta aparecerán aquí.",
  "Any tag": "Cualquier etiqueta",
  Archive: "Archivo",
  "Assign these accounts to a rally group in Battle Planning, then publish the plan.":
    "Asigna estas cuentas a un grupo de rally en Planificación de batalla y después publica el plan.",
  assigned: "asignado",
  Audience: "Destinatarios",
  "Battle activity retained across every battle period.":
    "La actividad se conserva entre todos los periodos de batalla.",
  "Battle history": "Historial de batallas",
  "Battle plan deleted.": "Plan de batalla eliminado.",
  "Battle plan updated. Republish to notify players.":
    "Plan de batalla actualizado. Vuelve a publicarlo para notificar a los jugadores.",
  "Battle planning": "Planificación de batalla",
  "Battle role": "Rol de batalla",
  "Battle structure": "Estructura de batalla",
  "Battle-day alliances": "Alianzas del día de batalla",
  "Call enemy rally": "Registrar rally enemigo",
  "Call rally": "Registrar rally",
  Cancel: "Cancelar",
  "Cancel rally": "Cancelar rally",
  Cancelled: "Cancelada",
  Capacity: "Capacidad",
  "Check your email to confirm your account.":
    "Revisa tu correo para confirmar la cuenta.",
  "Choose a state": "Elegir un estado",
  "Choose alliance": "Elegir alianza",
  "Choose battle role": "Elegir rol de batalla",
  "Choose role": "Elegir rol",
  "Choose tag": "Elegir etiqueta",
  "Choose tagged leader": "Elegir líder etiquetado",
  "Chief level": "Nivel de jefe",
  "Clear filters": "Borrar filtros",
  Color: "Color",
  "Combat profile saved.": "Perfil de combate guardado.",
  Comment: "Comentario",
  "Comment deleted.": "Comentario eliminado.",
  "Comment posted.": "Comentario publicado.",
  Comments: "Comentarios",
  "Complete your account": "Completa tu cuenta",
  "Completed battles": "Batallas completadas",
  Coordinator: "Coordinador",
  Coordinators: "Coordinadores",
  "Create tag": "Crear etiqueta",
  "Create the alliances available to battle planners. Member assignments are managed only from Battle Planning and become visible in Alliance Overview after publishing.":
    "Crea las alianzas disponibles para los planificadores. Las asignaciones de miembros solo se administran desde Planificación de batalla y aparecen en el resumen después de publicar.",
  "Create the first destination for your battle plans.":
    "Crea el primer destino para tus planes de batalla.",
  Decline: "Rechazar",
  Delete: "Eliminar",
  "Delete this comment?": "¿Eliminar este comentario?",
  "Destination alliance": "Alianza de destino",
  Edit: "Editar",
  Email: "Correo electrónico",
  Ended: "Finalizada",
  "Enemy leaders": "Líderes enemigos",
  "Enter a name, Rally Lead, and destination alliance.":
    "Introduce un nombre, un líder de rally y una alianza de destino.",
  "Enter a numeric WOS ID.": "Introduce un ID de WOS numérico.",
  "Enter only the WOS ID. Name, avatar, state, Furnace and statistics are synchronized automatically.":
    "Introduce solo el ID de WOS. El nombre, avatar, estado, Horno y estadísticas se sincronizan automáticamente.",
  "Enter a tag name.": "Introduce un nombre de etiqueta.",
  "Enter a title containing at least 3 characters.":
    "Introduce un título de al menos 3 caracteres.",
  "Enter a valid plan name and time.":
    "Introduce un nombre y una hora válidos para el plan.",
  "Enter an alliance name.": "Introduce un nombre de alianza.",
  "Enter an announcement message.": "Introduce el mensaje del anuncio.",
  "Enter the player's registered WOS ID. They receive an in-app invitation and must accept it. You then verify the player before they receive state access.":
    "Introduce el ID de WOS registrado del jugador. Recibirá una invitación dentro de la aplicación y deberá aceptarla. Después tendrás que verificarlo antes de concederle acceso.",
  "Enter your own position to see when you must send after calling the enemy rallies.":
    "Introduce tu posición para saber cuándo debes enviar después de registrar los rallies enemigos.",
  "Entire state": "Todo el estado",
  Furnace: "Horno",
  "Everyone who currently has this tag receives the message in their notification inbox.":
    "Todas las personas que tengan actualmente esta etiqueta recibirán el mensaje en sus notificaciones.",
  Expires: "Caduca",
  "Expires automatically": "Caduca automáticamente",
  "Formation update": "Actualización de formación",
  "Full Battle": "Batalla completa",
  "Incoming rally schedule": "Programa de rallies entrantes",
  Kills: "Bajas",
  "Labyrinth score": "Puntuación de Laberinto",
  "Last synchronized: {date}": "Última sincronización: {date}",
  Instructions: "Instrucciones",
  "Invite a WOS account": "Invitar una cuenta de WOS",
  "Join a state to view battle assignments":
    "Únete a un estado para ver las asignaciones de batalla",
  "Join a state to view notices": "Únete a un estado para ver los avisos",
  "Loading alliance overview...": "Cargando resumen de alianzas...",
  "Loading battle history...": "Cargando historial de batallas...",
  "Loading battle planning...": "Cargando planificación de batalla...",
  "Loading battle plans...": "Cargando planes de batalla...",
  "Loading Live Battle...": "Cargando Batalla en vivo...",
  "Loading notices...": "Cargando avisos...",
  "Loading notifications...": "Cargando notificaciones...",
  "Loading Overwatch...": "Cargando Overwatch...",
  "Loading tags...": "Cargando etiquetas...",
  "Loading your battle overview...": "Cargando tu resumen de batalla...",
  "Loading...": "Cargando...",
  Leaders: "Líderes",
  Loss: "Derrota",
  Manage: "Administrar",
  "Manage enemy rally leaders": "Administrar líderes de rally enemigos",
  "Manage state": "Administrar estado",
  "Manage tags": "Administrar etiquetas",
  Member: "Miembro",
  members: "miembros",
  Members: "Miembros",
  "Members & setup": "Miembros y configuración",
  Message: "Mensaje",
  Messages: "Mensajes",
  "Minimum all troop tiers": "Nivel mínimo de todas las tropas",
  "Minimum Fire Crystal Furnace": "Horno de Cristal de Fuego mínimo",
  "My pet is active": "Mi mascota está activa",
  Name: "Nombre",
  "No active battle": "No hay batalla activa",
  "No active messages for this account.":
    "No hay mensajes activos para esta cuenta.",
  "No active notices": "No hay avisos activos",
  "No alliance assignment yet.": "Todavía no hay una alianza asignada.",
  "No alliances configured": "No hay alianzas configuradas",
  "No battle periods have been recorded yet.":
    "Todavía no se ha registrado ningún periodo de batalla.",
  "No battle tags assigned.": "No hay etiquetas de batalla asignadas.",
  "No comments yet.": "Todavía no hay comentarios.",
  "No enemy leaders added.": "No se han añadido líderes enemigos.",
  "No incoming rallies.": "No hay rallies entrantes.",
  "No members assigned in the published plan.":
    "No hay miembros asignados en el plan publicado.",
  "No members found.": "No se encontraron miembros.",
  "No players are waiting for approval.":
    "No hay jugadores esperando aprobación.",
  "No public comments on this plan.":
    "No hay comentarios públicos en este plan.",
  "No published battle is currently scheduled.":
    "No hay ninguna batalla publicada programada actualmente.",
  "No tags yet": "Todavía no hay etiquetas",
  "No WOS accounts added.": "No se han añadido cuentas de WOS.",
  "No alliance": "Sin alianza",
  "Not on the battle roster": "Fuera de la lista de batalla",
  Notes: "Notas",
  Notices: "Avisos",
  Notifications: "Notificaciones",
  "Numeric WOS ID": "ID de WOS numérico",
  "Only state Owners and Admins can manage tags.":
    "Solo los propietarios y administradores pueden gestionar etiquetas.",
  "Only state owners and admins can manage this page.":
    "Solo los propietarios y administradores pueden gestionar esta página.",
  "Open battle history": "Abrir historial de batallas",
  "Open comments": "Abrir comentarios",
  "Open full plan": "Abrir plan completo",
  "Open Live Battle": "Abrir Batalla en vivo",
  "Open Overwatch": "Abrir Overwatch",
  "Operational updates for your state, alliance, tags, role, and battle responsibilities.":
    "Actualizaciones operativas sobre tu estado, alianza, etiquetas, rol y responsabilidades de batalla.",
  Overwatch: "Overwatch",
  "Overwatch becomes available after joining a state.":
    "Overwatch estará disponible después de unirte a un estado.",
  Owner: "Propietario",
  "Owner and admin tools": "Herramientas del propietario y administradores",
  Owners: "Propietarios",
  Password: "Contraseña",
  "Permission role": "Rol de permisos",
  "Pet active": "Mascota activa",
  "Pet active now": "Mascota activa ahora",
  "Pet remaining:": "Tiempo restante de mascota:",
  "Plan discussion": "Discusión del plan",
  "Plan name": "Nombre del plan",
  "Player name": "Nombre del jugador",
  "Player data could not be synchronized: {reason}":
    "No se pudieron sincronizar los datos del jugador: {reason}",
  "Player data synchronized from WOSOracle.":
    "Datos del jugador sincronizados desde WOSOracle.",
  "Player's WOS ID": "ID de WOS del jugador",
  Players: "Jugadores",
  "Position:": "Posición:",
  "Public — all state members": "Público: todos los miembros del estado",
  "Public comments": "Comentarios públicos",
  "Public username": "Nombre de usuario público",
  "Public username:": "Nombre de usuario público:",
  "Pending synchronization": "Sincronización pendiente",
  Power: "Potencia",
  "Published assignments": "Asignaciones publicadas",
  "published assignments": "asignaciones publicadas",
  Rallies: "Rallies",
  "Rallies called": "Rallies registrados",
  "Rally Lead": "Líder de rally",
  "Rally leader": "Líder de rally",
  "Rally minutes remaining": "Minutos restantes del rally",
  "Rally seconds remaining": "Segundos restantes del rally",
  "Rally timer:": "Temporizador del rally:",
  Reject: "Rechazar",
  "Remove leader": "Eliminar líder",
  Remove: "Eliminar",
  "Refresh player data": "Actualizar datos del jugador",
  "Reusable labels": "Etiquetas reutilizables",
  "Review request": "Revisar solicitud",
  Save: "Guardar",
  "Save combat profile": "Guardar perfil de combate",
  "Save plan": "Guardar plan",
  "Saved leaders": "Líderes guardados",
  Scheduled: "Programada",
  seconds: "segundos",
  "Synchronizing...": "Sincronizando...",
  "Select a state before opening battle planning.":
    "Selecciona un estado antes de abrir la planificación de batalla.",
  "Select an enemy rally leader.": "Selecciona un líder de rally enemigo.",
  "Select or join a state first.":
    "Primero selecciona un estado o únete a uno.",
  "Select rally leader": "Seleccionar líder de rally",
  "Send invitation": "Enviar invitación",
  "Send notices": "Enviar avisos",
  "Send reinforcement at:": "Enviar refuerzo a las:",
  Sent: "Enviado",
  "Sign in": "Iniciar sesión",
  "Sound alerts": "Alertas de sonido",
  Started: "Iniciada",
  "State administration": "Administración del estado",
  "State announcements become available after membership approval.":
    "Los anuncios del estado estarán disponibles tras aprobar la membresía.",
  "State invitation": "Invitación al estado",
  "State members": "Miembros del estado",
  "State record": "Registro del estado",
  "State role": "Rol del estado",
  "State stats": "Estadísticas del estado",
  "State tags": "Etiquetas del estado",
  "Stats & history": "Estadísticas e historial",
  "System tags are permanent and are managed from State members.":
    "Las etiquetas del sistema son permanentes y se administran desde Miembros del estado.",
  Tag: "Etiqueta",
  "Tag after publish": "Etiquetar después de publicar",
  "Tag created.": "Etiqueta creada.",
  "Tag deleted.": "Etiqueta eliminada.",
  "Tag name": "Nombre de la etiqueta",
  "Tag updated.": "Etiqueta actualizada.",
  Tags: "Etiquetas",
  "Tell the selected members what they need to know.":
    "Indica a los miembros seleccionados lo que necesitan saber.",
  "The selected WOS accounts are saved as the recipient list when you send. Notices expire automatically Sunday at 23:59 UTC.":
    "Las cuentas de WOS seleccionadas se guardan como destinatarios al enviar. Los avisos caducan automáticamente el domingo a las 23:59 UTC.",
  "These players accepted an invitation. Confirm their identity outside the app before approving them.":
    "Estos jugadores aceptaron una invitación. Confirma su identidad fuera de la aplicación antes de aprobarlos.",
  "This is the current published battle-day roster. Member assignments can only be changed from Battle Planning.":
    "Esta es la lista publicada para el día de batalla. Las asignaciones solo pueden cambiarse desde Planificación de batalla.",
  "This WOS account cannot be removed while it belongs to a state.":
    "Esta cuenta de WOS no puede eliminarse mientras pertenezca a un estado.",
  "This WOS account does not have a live battle role.":
    "Esta cuenta de WOS no tiene un rol de batalla en vivo.",
  "This WOS account has not been assigned to a rally group.":
    "Esta cuenta de WOS no ha sido asignada a ningún grupo de rally.",
  Title: "Título",
  Type: "Tipo",
  "Unassigned accounts": "Cuentas sin asignar",
  "Until Sunday 23:59 UTC": "Hasta el domingo a las 23:59 UTC",
  "Use a six-digit color code such as #4f8fba.":
    "Usa un código de color de seis dígitos, como #4f8fba.",
  "Use a six-digit color code such as #e4a853.":
    "Usa un código de color de seis dígitos, como #e4a853.",
  Username: "Nombre de usuario",
  "Verify and approve": "Verificar y aprobar",
  Visibility: "Visibilidad",
  VIP: "VIP",
  active: "activo",
  "Waiting for owner verification": "Esperando verificación del propietario",
  "Waiting for your verification": "Esperando tu verificación",
  Win: "Victoria",
  "WOS accounts": "Cuentas de WOS",
  "Troop details (manual)": "Detalles de tropas (manual)",
  "WOSOracle does not provide troop tiers, camp FC levels or T12 skills, so these fields remain manual.":
    "WOSOracle no proporciona los niveles de tropas, niveles FC de campamento ni habilidades T12, por lo que estos campos siguen siendo manuales.",
  "WOS ID": "ID de WOS",
  "Write a comment. Use @username to mention and notify someone.":
    "Escribe un comentario. Usa @usuario para mencionar y notificar a alguien.",
  "Write a comment. Use @username to notify another member.":
    "Escribe un comentario. Usa @usuario para notificar a otro miembro.",
  "X coordinate": "Coordenada X",
  "Y coordinate": "Coordenada Y",
  "You do not have any notifications yet.": "Todavía no tienes notificaciones.",
  "Your assignment": "Tu asignación",
  "Your battle assignment, tags, alliance and operational messages.":
    "Tu asignación de batalla, etiquetas, alianza y mensajes operativos.",
  "Your battle notices": "Tus avisos de batalla",
  "Your email is private and is never shown to other players.":
    "Tu correo es privado y nunca se muestra a otros jugadores.",
  "Your in-game name and public game data will be synchronized automatically from your WOS ID.":
    "Tu nombre en el juego y tus datos públicos se sincronizarán automáticamente desde tu ID de WOS.",
  "Your march time:": "Tu tiempo de marcha:",
  "Your notices": "Tus avisos",
  "Your numeric WOS ID": "Tu ID de WOS numérico",
  "Your reinforcement setup": "Tu configuración de refuerzos",
  "Your reinforcement timing": "Tu horario de refuerzos",
  "Your tags": "Tus etiquetas",
  "Your username is public. Your email remains private and is only used to sign in.":
    "Tu nombre de usuario es público. Tu correo permanece privado y solo se usa para iniciar sesión.",
  "Your WOS accounts": "Tus cuentas de WOS",
  "Your X coordinate": "Tu coordenada X",
  "Your Y coordinate": "Tu coordenada Y",
  " — Pet active": " — Mascota activa",
  " — Pet inactive": " — Mascota inactiva",
  " — Pet remaining: {time}": " — Mascota restante: {time}",
  account: "cuenta",
  accounts: "cuentas",
  Active: "Activo",
  "Admin only": "Solo administradores",
  alliance: "alianza",
  alliances: "alianzas",
  Battle: "Batalla",
  "Battle period active": "Periodo de batalla activo",
  "Complete setup": "Completar configuración",
  "Create account": "Crear cuenta",
  "Create alliance": "Crear alianza",
  "Enable notifications": "Activar notificaciones",
  "Former member": "Antiguo miembro",
  Inactive: "Inactivo",
  "Live Battle": "Batalla en vivo",
  "Loading state memberships...": "Cargando membresías de estado...",
  "Need an account? Sign up": "¿Necesitas una cuenta? Regístrate",
  "Not in a state": "No pertenece a ningún estado",
  "Not selected": "Sin seleccionar",
  "Not started": "No iniciada",
  "Notifications enabled": "Notificaciones activadas",
  "Please wait...": "Espera...",
  "Post comment": "Publicar comentario",
  "Posting...": "Publicando...",
  Public: "Público",
  rally: "rally",
  rallies: "rallies",
  Republish: "Volver a publicar",
  "Saving...": "Guardando...",
  "Send announcement": "Enviar anuncio",
  "Send in {seconds} seconds": "Enviar en {seconds} segundos",
  "Send now": "Enviar ahora",
  "Send time passed": "La hora de envío ha pasado",
  "SEND NOW": "ENVIAR AHORA",
  "SEND REINFORCEMENTS NOW": "ENVÍA REFUERZOS AHORA",
  "Sending...": "Enviando...",
  "State member": "Miembro del estado",
  tag: "etiqueta",
  tags: "etiquetas",
  "This browser does not support notifications.":
    "Este navegador no admite notificaciones.",
  UNCLASSIFIED: "SIN CLASIFICAR",
  Unknown: "Desconocido",
  "Unnamed account": "Cuenta sin nombre",
  "Unnamed WOS account": "Cuenta de WOS sin nombre",
  "Already have an account? Sign in": "¿Ya tienes una cuenta? Inicia sesión",
  " · permanent system tag": " · etiqueta permanente del sistema",
  " — expires {date}": " — caduca {date}",
  "Alliance assigned": "Alianza asignada",
  "Alliance assignment changed": "Asignación de alianza modificada",
  "Alliance assignment removed": "Asignación de alianza eliminada",
  "Battle assignment published": "Asignación de batalla publicada",
  "Battle plan published": "Plan de batalla publicado",
  Completed: "Completada",
  Draft: "Borrador",
  "Infantry camp FC": "FC del campamento de infantería",
  "Infantry T12 skill": "Habilidad T12 de infantería",
  "Infantry troop tier": "Nivel de tropas de infantería",
  "In progress": "En curso",
  "Lancer camp FC": "FC del campamento de lanceros",
  "Lancer T12 skill": "Habilidad T12 de lanceros",
  "Lancer troop tier": "Nivel de tropas de lanceros",
  "Marksman camp FC": "FC del campamento de tiradores",
  "Marksman T12 skill": "Habilidad T12 de tiradores",
  "Marksman troop tier": "Nivel de tropas de tiradores",
  Membership: "Membresía",
  "Mentioned in a battle plan": "Mencionado en un plan de batalla",
  "New battle plan comment": "Nuevo comentario en un plan de batalla",
  "New state vote": "Nueva votación del estado",
  "New tag": "Nueva etiqueta",
  Notice: "Aviso",
  "Not scheduled": "No programada",
  Published: "Publicado",
  State: "Estado",
};

export type TranslationKey = string;

export const translations: Record<AppLocale, Record<string, string>> = {
  en: english,
  zh: {
    ...chineseInterface,
    notifications: "通知",
    unreadNotifications: "条未读通知",
    openProfileMenu: "打开个人资料菜单",
    setupRequired: "需要完成设置",
    profile: "个人资料",
    wosAccounts: "WOS 账号",
    signOut: "退出登录",
    signIn: "登录",
    overwatch: "指挥中心",
    votes: "投票",
    planning: "作战计划",
    liveBattle: "实时战斗",
    state: "州",
    activeWorkspace: "当前工作区",
    noStateSelected: "尚未选择州。请查看通知中的邀请。",
    language: "语言",
    mainNavigation: "主导航",
    roleOwner: "州主",
    roleAdmin: "管理员",
    roleMember: "成员",
    delete: "删除",
  },
  es: {
    ...spanishInterface,
    notifications: "Notificaciones",
    unreadNotifications: "notificaciones sin leer",
    openProfileMenu: "Abrir menú del perfil",
    setupRequired: "Configuración necesaria",
    profile: "Perfil",
    wosAccounts: "Cuentas de WOS",
    signOut: "Cerrar sesión",
    signIn: "Iniciar sesión",
    overwatch: "Overwatch",
    votes: "Votaciones",
    planning: "Planificación",
    liveBattle: "Batalla en vivo",
    state: "Estado",
    activeWorkspace: "Espacio activo",
    noStateSelected:
      "No hay ningún estado seleccionado. Revisa tus notificaciones para ver una invitación.",
    language: "Idioma",
    mainNavigation: "Navegación principal",
    roleOwner: "propietario",
    roleAdmin: "administrador",
    roleMember: "miembro",
    delete: "Eliminar",
  },
  ar: {
    ...arabicInterface,
    notifications: "الإشعارات",
    unreadNotifications: "إشعارات غير مقروءة",
    openProfileMenu: "فتح قائمة الملف الشخصي",
    setupRequired: "الإعداد مطلوب",
    profile: "الملف الشخصي",
    wosAccounts: "حسابات WOS",
    signOut: "تسجيل الخروج",
    signIn: "تسجيل الدخول",
    overwatch: "مركز القيادة",
    votes: "التصويتات",
    planning: "التخطيط",
    liveBattle: "المعركة المباشرة",
    state: "الولاية",
    activeWorkspace: "مساحة العمل النشطة",
    noStateSelected: "لم يتم اختيار ولاية. تحقق من إشعاراتك بحثًا عن دعوة.",
    language: "اللغة",
    mainNavigation: "التنقل الرئيسي",
    roleOwner: "المالك",
    roleAdmin: "المسؤول",
    roleMember: "عضو",
    delete: "حذف",
  },
  th: {
    ...thaiInterface,
    notifications: "การแจ้งเตือน",
    unreadNotifications: "การแจ้งเตือนที่ยังไม่ได้อ่าน",
    openProfileMenu: "เปิดเมนูโปรไฟล์",
    setupRequired: "ต้องตั้งค่าให้เสร็จ",
    profile: "โปรไฟล์",
    wosAccounts: "บัญชี WOS",
    signOut: "ออกจากระบบ",
    signIn: "เข้าสู่ระบบ",
    overwatch: "โอเวอร์วอทช์",
    votes: "โหวต",
    planning: "วางแผน",
    liveBattle: "การรบสด",
    state: "รัฐ",
    activeWorkspace: "พื้นที่ทำงานปัจจุบัน",
    noStateSelected: "ยังไม่ได้เลือกรัฐ โปรดตรวจสอบคำเชิญในการแจ้งเตือน",
    language: "ภาษา",
    mainNavigation: "เมนูนำทางหลัก",
    roleOwner: "เจ้าของ",
    roleAdmin: "ผู้ดูแล",
    roleMember: "สมาชิก",
    delete: "ลบ",
  },
};
