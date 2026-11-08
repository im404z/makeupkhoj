export function stripEmoji(value){
  return String(value??'').replace(/(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?(?:\p{Emoji_Modifier})?)*)/gu,match=>['©','®','™','↗','↘','↔','↕','←','→'].includes(match)?match:'').replace(/[ \t]{2,}/g,' ').trim();
}
