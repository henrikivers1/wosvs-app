import type { AppLocale } from "@/i18n/config";
import { arabicInterface } from "@/i18n/locales/ar";
import { chineseInterface } from "@/i18n/locales/zh";
import { thaiInterface } from "@/i18n/locales/th";

const english = {
  battleCoordination: "Battle coordination",
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
  closed: "Closed",
  open: "Open",
  delete: "Delete",
} as const;

const spanishInterface: Record<string, string> = {
  "Welcome back":
    "Bienvenido de nuevo",
  "Join your state":
    "Únete a tu estado",
  "Sign in to see your SvS, your rally and your send times.":
    "Inicia sesión para ver tu SvS, tu rally y tus horas de envío.",
  "Create an account with your WOS ID; your state's admins get your join request automatically.":
    "Crea una cuenta con tu WOS ID; los admins de tu estado reciben tu solicitud automáticamente.",
  "State management":
    "Gestión del estado",
  "Members, alliances and how the automation prepares each SvS. Planning and battles run by themselves.":
    "Miembros, alianzas y cómo la automatización prepara cada SvS. La planificación y las batallas funcionan solas.",
  "{count} Rally Leads":
    "{count} líderes de rally",
  "Rally from {name} called.":
    "Rally de {name} registrado.",
  "Cancel the rally from {name} for everyone?":
    "¿Cancelar el rally de {name} para todos?",
  "Pick the opponent's players below. Their coordinates are remembered: next battle they are prefilled, and leaders you added before are listed automatically when the battle starts.":
    "Elige abajo a los jugadores del rival. Sus coordenadas se recuerdan: en la próxima batalla se rellenan solas y los líderes que añadiste antes aparecen automáticamente al empezar.",
  "Coordinates from the last battle against this player.":
    "Coordenadas de la última batalla contra este jugador.",
  "Battles start automatically at 12:00 UTC on battle day. Live tools appear here then.":
    "Las batallas empiezan solas a las 12:00 UTC del día de batalla. Las herramientas aparecen aquí entonces.",
  "You have not joined a state yet. When the state of your WOS account uses WOSOverwatch, a join request is sent automatically; you get a notification when an admin approves it.":
    "Aún no te has unido a un estado. Cuando el estado de tu cuenta WOS use WOSOverwatch, se envía una solicitud automáticamente; recibirás una notificación cuando un admin la apruebe.",
  "That username may already be registered.":
    "Ese nombre de usuario puede estar ya registrado.",
  "Review rallies":
    "Revisar rallies",
  "Vote now":
    "Votar ahora",
  "SvS plans, rallies and battles run automatically from the draw.":
    "Los planes SvS, rallies y batallas funcionan solos desde el sorteo.",
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
  "Everything below runs by itself: the plan is created at the draw, rallies are set up and filled from attendance 24 hours before the battle and published 6 hours before. Adjust anything by hand; the automation never undoes your changes.":
    "Todo lo de abajo funciona solo: el plan se crea en el sorteo, los rallies se arman y llenan con la asistencia 24 horas antes y se publican 6 horas antes. Ajusta lo que quieras; la automatización nunca deshace tus cambios.",
  "No upcoming battle plan.":
    "No hay plan de batalla próximo.",
  "Earlier plans ({count})":
    "Planes anteriores ({count})",
  "Delete the “{name}” tag? It is removed from {count} WOS accounts.":
    "¿Eliminar la etiqueta “{name}”? Se quita de {count} cuentas WOS.",
  "Labels for announcements and your own groupings. Rally and hero tags are created automatically from the published plan.":
    "Etiquetas para anuncios y tus propios grupos. Las de rally y héroe se crean solas desde el plan publicado.",
  "Create a tag above, then add players to it.":
    "Crea una etiqueta arriba y luego añade jugadores.",
  "Managed in Planning":
    "Se gestiona en Planificación",
  "Run the latest database migration to use automatic planning.":
    "Ejecuta la última migración de la base de datos para usar la planificación automática.",
  "Automation saved.":
    "Automatización guardada.",
  "SvS automation":
    "Automatización SvS",
  "After the draw, the app reminds members to vote 30 hours before the battle, sets up and fills the rallies 24 hours before, adds late voters every hour and publishes 6 hours before. You can change anything by hand in Planning.":
    "Tras el sorteo, la app recuerda votar 30 horas antes, arma y llena los rallies 24 horas antes, añade a quienes votan tarde cada hora y publica 6 horas antes. Puedes cambiar todo a mano en Planificación.",
  "Set up and fill rallies automatically":
    "Armar y llenar rallies automáticamente",
  "Publish automatically 6 hours before the battle":
    "Publicar automáticamente 6 horas antes de la batalla",
  "Number of rallies":
    "Número de rallies",
  "Players per rally (with leader)":
    "Jugadores por rally (con líder)",
  "Default formation (Inf/Lan/Mark %)":
    "Formación por defecto (Inf/Lan/Tir %)",
  "Default joiner heroes for every rally":
    "Héroes de unión por defecto en cada rally",
  "None":
    "Ninguno",
  "Draw: vs state {opponent}":
    "Sorteo: contra el estado {opponent}",
  "SvS plan created":
    "Plan SvS creado",
  "Battle {time} (12:00–17:00 UTC).":
    "Batalla {time} (12:00–17:00 UTC).",
  "Attendance: {voted}/{total} voted, {available} can play":
    "Asistencia: {voted}/{total} votaron, {available} pueden jugar",
  "Members who had not voted were reminded.":
    "Se recordó a quienes no habían votado.",
  "Members who have not voted are reminded at {time}.":
    "Se recordará a quienes no votaron el {time}.",
  "Rallies: {rallies} with {players} players":
    "Rallies: {rallies} con {players} jugadores",
  "Rallies: not generated yet":
    "Rallies: aún no generados",
  "Generated automatically at {time} from your Rally Leads and best Labyrinth players, then filled by your auto-fill priorities.":
    "Se generan solos el {time} con tus líderes de rally y los mejores del Laberinto, y se llenan según tus prioridades de autollenado.",
  "Automatic rallies are off for this state.":
    "Los rallies automáticos están desactivados en este estado.",
  "{count} players who can play have no rally yet. They are added to open slots every hour.":
    "{count} jugadores que pueden jugar aún no tienen rally. Se añaden a huecos libres cada hora.",
  "Late voters are added to open slots every hour.":
    "Quienes votan tarde se añaden a huecos libres cada hora.",
  "Fill open slots now":
    "Llenar huecos ahora",
  "Generate now":
    "Generar ahora",
  "Not published yet":
    "Aún no publicado",
  "Every member got their rally, hero and formation.":
    "Cada miembro recibió su rally, héroe y formación.",
  "{count} rallies have no destination alliance.":
    "{count} rallies no tienen alianza de destino.",
  "Published automatically at {time}.":
    "Se publica automáticamente el {time}.",
  "Automatic publishing is off: publish when ready.":
    "La publicación automática está desactivada: publica cuando esté listo.",
  "Publish now":
    "Publicar ahora",
  "Battle goes live automatically":
    "La batalla empieza sola",
  "Live Battle opens for callers and garrison at {time}.":
    "Batalla en vivo se abre para coordinadores y guarnición el {time}.",
  "Next SvS":
    "Próxima SvS",
  "Can you join the SvS?":
    "¿Puedes unirte a la SvS?",
  "Rallies are ready for review":
    "Los rallies están listos para revisar",
  "Total power":
    "Poder total",
  "SvS opponent drawn":
    "Rival de SvS sorteado",
  "Comments & notices":
    "Comentarios y avisos",
  "{player}: vote whether you can join {plan} so you get a rally spot.":
    "{player}: vota si puedes unirte a {plan} para tener un lugar en un rally.",
  "{rallies} rallies with {players} players were set up for {plan}.":
    "Se armaron {rallies} rallies con {players} jugadores para {plan}.",
  "They are published automatically at {time}.":
    "Se publican automáticamente el {time}.",
  "Publish them from Planning.":
    "Publícalos desde Planificación.",
  "Add":
    "Añadir",
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
  "Only players who have one of the rally's joiner heroes at 4★":
    "Solo jugadores con uno de los héroes de apoyo del rally con 4★",
  "Pick an enemy rally leader": "Elige un líder de rally enemigo",
  "Load their top players": "Cargar sus mejores jugadores",
  "Their {count} strongest players": "Sus {count} jugadores más fuertes",
  "Not in the top {count}? Search an alliance roster":
    "¿No está en el top {count}? Busca en la lista de una alianza",
  "Add a priority": "Añadir una prioridad",
  "Add at least one rally group first.":
    "Primero añade al menos un grupo de rally.",
  "Add from WOSOracle": "Añadir desde WOSOracle",
  "Add manually": "Añadir manualmente",
  Added: "Añadida",
  "Alliance ID": "ID de alianza",
  "Alliance added. It can now be selected in Battle Planning.":
    "Alianza añadida. Ya se puede elegir en la planificación.",
  "Auto-fill": "Autorrelleno",
  "Auto-fill placed {count} players. Review the rallies, then publish.":
    "El autorrelleno colocó a {count} jugadores. Revisa los rallies y publica.",
  "Auto-fill rallies": "Autorrellenar rallies",
  "Battle half": "Mitad de la batalla",
  "Clear selection": "Quitar selección",
  "Drop players here, or select them and use Move selected here.":
    "Suelta jugadores aquí, o selecciónalos y usa Mover selección aquí.",
  "Each joiner hero can only be used once per rally.":
    "Cada héroe de apoyo solo se puede usar una vez por rally.",
  "Enter a numeric alliance ID.": "Introduce un ID de alianza numérico.",
  "Equal power across rallies": "Poder igualado entre rallies",
  "FC level": "Nivel FC",
  "Fill the rallies for me": "Rellenar los rallies por mí",
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
  "Move selected here ({count})": "Mover selección aquí ({count})",
  "Move up": "Subir",
  "Move {count} selected to…": "Mover {count} seleccionados a…",
  "No 4★ joiner heroes": "Sin héroes de apoyo 4★",
  "No hero yet": "Sin héroe aún",
  "No joiner heroes chosen yet.": "Aún no hay héroes de apoyo elegidos.",
  "Not assigned yet": "Aún sin asignar",
  "Not filled in yet": "Aún sin rellenar",
  "Not set": "Sin configurar",
  "Pick players for the rallies": "Elige jugadores para los rallies",
  "Rally setup": "Configurar rally",
  "Save heroes": "Guardar héroes",
  "Save rally setup": "Guardar configuración",
  Select: "Seleccionar",
  "Select all shown": "Seleccionar todos los mostrados",
  "Showing the first 80 of {count}. Use the filters to narrow the list.":
    "Mostrando los primeros 80 de {count}. Usa los filtros para acotar.",
  "Sort by": "Ordenar por",
  "Start from empty rallies (keeps the leaders)":
    "Empezar con rallies vacíos (mantiene a los líderes)",
  "Tick every hero you have at 4 stars or more. Admins use this to give you a hero to join rallies with.":
    "Marca cada héroe que tengas con 4 estrellas o más. Los administradores lo usan para darte un héroe con el que unirte a los rallies.",
  "Troop tier": "Nivel de tropa",
  "Unassigned players": "Jugadores sin asignar",
  "Update them on your account page": "Actualízalos en tu página de cuenta",
  "Use Infantry/Lancer/Marksman percentages that add up to 100, like 50/20/30.":
    "Usa porcentajes de Infantería/Lancero/Tirador que sumen 100, como 50/20/30.",
  "Uses players who voted they can play each rally's half, and gives each one a joiner hero they have at 4★. Nothing is sent until you publish.":
    "Usa a los jugadores que votaron que pueden jugar la mitad de cada rally y da a cada uno un héroe de apoyo que tenga con 4★. No se envía nada hasta que publiques.",
  "Voice call first": "Chat de voz primero",
  "WOSOracle could not be reached.": "No se pudo contactar con WOSOracle.",
  "WOSOracle lists no alliances for your state yet.":
    "WOSOracle aún no lista alianzas para tu estado.",
  "WOSOracle lists only your state's strongest alliances. Add shell alliances by their alliance ID, or type a name below.":
    "WOSOracle solo lista las alianzas más fuertes de tu estado. Añade alianzas vacías por su ID o escribe un nombre abajo.",
  "Your 4★ joiner heroes are not filled in yet.":
    "Aún no has rellenado tus héroes de apoyo 4★.",
  "not set": "sin configurar",
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
  "· Lab": "· Lab",
  "Delete plan": "Eliminar plan",
  "Delete “{name}”, every group in it and its upcoming battle? Finished battles stay in the history.":
    "¿Eliminar «{name}», todos sus grupos y su próxima batalla? Las batallas terminadas se quedan en el historial.",
  Lab: "Lab",
  "Make Rally Lead": "Hacer líder de rally",
  "No Labyrinth scores yet. They appear after members' accounts are synced.":
    "Aún no hay puntuaciones de Laberinto. Aparecen cuando se sincronizan las cuentas de los miembros.",
  "Rally leads": "Líderes de rally",
  "Ranked from your members' synced WOSOracle data. Mark the players who lead rallies; only Rally Leads can lead a group.":
    "Clasificado con los datos sincronizados de WOSOracle de tus miembros. Marca a quienes lideran rallies; solo los líderes de rally pueden liderar un grupo.",
  "Remove Rally Lead": "Quitar líder de rally",
  "Top 20 Labyrinth in your state": "Top 20 del Laberinto en tu estado",
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
  "· Troops": "· Tropas",
  "/2000 characters": "/2000 caracteres",
  "A limited free trial can be arranged before purchasing state access. Monthly plans may be introduced later.":
    "Se puede organizar una prueba gratuita limitada antes de comprar el acceso al estado. Más adelante podrían añadirse planes mensuales.",
  "A shared workspace for enemy rally calls, synchronized impact waves, and personal garrison send times.":
    "Un espacio compartido para avisos de rallies enemigos, oleadas de impacto sincronizadas y horarios personales de envío de guarnición.",
  Accept: "Aceptar",
  "Access model": "Modelo de acceso",
  Account: "Cuenta",
  "Active announcements": "Anuncios activos",
  "Add a public comment": "Añadir un comentario público",
  "Add another WOS account": "Añadir otra cuenta de WOS",
  "Add leader": "Añadir líder",
  "Add rally group": "Añadir grupo de rally",
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
  "Assign Rally Lead tags from State members first.":
    "Primero asigna etiquetas de líder de rally desde Miembros del estado.",
  "Assign these accounts to a rally group in Battle Planning, then publish the plan.":
    "Asigna estas cuentas a un grupo de rally en Planificación de batalla y después publica el plan.",
  assigned: "asignado",
  Assignment: "Asignación",
  Audience: "Destinatarios",
  "Avg furnace": "Promedio de horno",
  "Avg power": "Potencia media",
  "Avg T12 skill": "Promedio de habilidad T12",
  "Avg troop": "Promedio de tropas",
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
  Contact: "Contacto",
  "Contact us on Discord with your state name and a short description of your team.":
    "Contáctanos en Discord con el nombre de tu estado y una breve descripción de tu equipo.",
  Coordinator: "Coordinador",
  Coordinators: "Coordinadores",
  "Create group": "Crear grupo",
  "Create tag": "Crear etiqueta",
  "Create the alliances available to battle planners. Member assignments are managed only from Battle Planning and become visible in Alliance Overview after publishing.":
    "Crea las alianzas disponibles para los planificadores. Las asignaciones de miembros solo se administran desde Planificación de batalla y aparecen en el resumen después de publicar.",
  "Create the first destination for your battle plans.":
    "Crea el primer destino para tus planes de batalla.",
  "Creating an account is free. Creating a state requires a one-time state creation entitlement issued by WOS Battle Planner. State members join through invitations from their state owner.":
    "Crear una cuenta es gratis. Crear un estado requiere un permiso de creación de un solo uso emitido por WOSOverwatch. Los miembros se unen mediante invitaciones del propietario.",
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
  "Garrison players": "Jugadores de guarnición",
  "Group name": "Nombre del grupo",
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
  "Leader:": "Líder:",
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
  "Mention another state member with their account username, for example @Henrik. They receive a notification. Owners and Admins are notified about new comments.":
    "Menciona a otro miembro con su nombre de usuario, por ejemplo @Henrik. Recibirá una notificación. Los propietarios y administradores también reciben avisos de comentarios nuevos.",
  Message: "Mensaje",
  Messages: "Mensajes",
  "Minimum all troop tiers": "Nivel mínimo de todas las tropas",
  "Minimum Fire Crystal Furnace": "Horno de Cristal de Fuego mínimo",
  "My pet is active": "Mi mascota está activa",
  Name: "Nombre",
  "Name, username, or WOS ID": "Nombre, usuario o ID de WOS",
  "No active battle": "No hay batalla activa",
  "No active messages for this account.":
    "No hay mensajes activos para esta cuenta.",
  "No active notices": "No hay avisos activos",
  "No alliance assignment yet.": "Todavía no hay una alianza asignada.",
  "No alliances configured": "No hay alianzas configuradas",
  "No battle periods have been recorded yet.":
    "Todavía no se ha registrado ningún periodo de batalla.",
  "No battle plans yet": "Todavía no hay planes de batalla",
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
  "One-time state setup": "Configuración única del estado",
  "Only accounts with the permanent Rally Lead tag appear as leaders.":
    "Solo las cuentas con la etiqueta permanente de líder de rally aparecen como líderes.",
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
  "Placeholder account — official contact information will be added before launch.":
    "Cuenta provisional: se añadirá la información oficial de contacto antes del lanzamiento.",
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
  "Rally group created and its leader assigned.":
    "Grupo de rally creado y líder asignado.",
  "Rally group updated. Republish to apply assignments.":
    "Grupo de rally actualizado. Vuelve a publicar para aplicar las asignaciones.",
  "Rally Lead": "Líder de rally",
  "Rally Lead:": "Líder de rally:",
  "Rally leader": "Líder de rally",
  "Rally minutes remaining": "Minutos restantes del rally",
  "Rally seconds remaining": "Segundos restantes del rally",
  "Rally timer:": "Temporizador del rally:",
  "Rally timing for organized SVS states.":
    "Coordinación de rallies para estados organizados de SVS.",
  "Receive a personal send time and browser alerts.":
    "Recibe un horario personal de envío y alertas del navegador.",
  "Record calls and maintain the shared schedule.":
    "Registra avisos y mantiene el horario compartido.",
  Reject: "Rechazar",
  "Remove leader": "Eliminar líder",
  Remove: "Eliminar",
  "Request a trial or state setup":
    "Solicitar prueba o configuración de estado",
  "Request state access": "Solicitar acceso al estado",
  "Refresh player data": "Actualizar datos del jugador",
  "Reusable labels": "Etiquetas reutilizables",
  "Review request": "Revisar solicitud",
  Save: "Guardar",
  "Save combat profile": "Guardar perfil de combate",
  "Save group": "Guardar grupo",
  "Save plan": "Guardar plan",
  "Saved leaders": "Líderes guardados",
  Scheduled: "Programada",
  "Scheduled operations": "Operaciones programadas",
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
  "Sign in or create an account": "Iniciar sesión o crear una cuenta",
  "Sound alerts": "Alertas de sonido",
  Started: "Iniciada",
  "State administration": "Administración del estado",
  "State announcements become available after membership approval.":
    "Los anuncios del estado estarán disponibles tras aprobar la membresía.",
  "State invitation": "Invitación al estado",
  "State members": "Miembros del estado",
  "State owners": "Propietarios del estado",
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
  Unassigned: "Sin asignar",
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
  "Write a comment before posting.":
    "Escribe un comentario antes de publicarlo.",
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
  "· Power": "· Potencia",
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
  "Draft and published plans": "Planes borrador y publicados",
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
  "Publish & schedule": "Publicar y programar",
  "Published plans": "Planes publicados",
  rally: "rally",
  rallies: "rallies",
  Republish: "Volver a publicar",
  "Saving...": "Guardando...",
  "Select before publishing": "Seleccionar antes de publicar",
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
    battleCoordination: "战斗协调",
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
    closed: "已结束",
    open: "开放中",
    delete: "删除",
  },
  es: {
    ...spanishInterface,
    battleCoordination: "Coordinación de batalla",
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
    closed: "Cerrada",
    open: "Abierta",
    delete: "Eliminar",
  },
  ar: {
    ...arabicInterface,
    battleCoordination: "تنسيق المعارك",
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
    closed: "مغلق",
    open: "مفتوح",
    delete: "حذف",
  },
  th: {
    ...thaiInterface,
    battleCoordination: "การประสานงานการรบ",
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
    closed: "ปิดแล้ว",
    open: "เปิดอยู่",
    delete: "ลบ",
  },
};
