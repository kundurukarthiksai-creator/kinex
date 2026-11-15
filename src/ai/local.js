export const COLORS = { red:'#E5484D',blue:'#2F5BFF',green:'#3FA36B',yellow:'#FFC53D',orange:'#F28C28',purple:'#8E4EC6',pink:'#F06AA7',white:'#F4F7FB',black:'#23263A',gold:'#D4A72C',silver:'#B8BFCC',teal:'#12A594',brown:'#8A5A3B',cyan:'#62E3E1' }
export const normalizeCommand = (text) => String(text).toLowerCase().trim().replace(/[.!?]+$/,'').replace(/^(?:can|could|would) you(?: please)?\s+/,'').replace(/^please\s+/,'').replace(/^(?:i (?:want|need|would like)|i'd like)(?: you)?(?: to)?\s+/,'')
export const isCreation = (text) => /^(?:create|spawn|add|build|generate|draw|give me|show me|make (?:me )?(?:a|an|one)|a|an)\b/i.test(normalizeCommand(text))

const target = (text) => {
  const match = text.match(/^(?:make|paint|colou?r|turn|change|move|rotate|delete|remove)\s+(?:the\s+)?(.+?)(?:\s+(?:bigger|larger|smaller|red|blue|green|yellow|orange|purple|pink|white|black|gold|silver|teal|brown|cyan|metal|metallic|matte|plastic|glass|wood|left|right|up|down|closer|farther|\d+))?(?:\s|$)/)
  return match && !/^(?:it|this|that|object|model)$/.test(match[1]) ? match[1] : undefined
}

export function partColorsFromText(raw) {
  const colors={}
  const text=String(raw).toLowerCase()
  const names=Object.keys(COLORS).join('|')
  const parts='hull|decks?|windows?|rails?|trim|lifeboats?|funnels?|vents?'
  const normalize=part=>part.replace(/^(deck|window|rail|lifeboat|vent)$/,'$1s').replace(/^funnels$/,'funnel')
  for (const match of text.matchAll(new RegExp(`\\b(${names})\\s+(${parts})\\b`,'g'))) colors[normalize(match[2])]=COLORS[match[1]]
  for (const match of text.matchAll(new RegExp(`\\b(${parts})(?:\\s+(?:to|is|in))?\\s+(${names})\\b`,'g'))) colors[normalize(match[1])]=COLORS[match[2]]
  return colors
}

export function localPlan(raw) {
  const text = normalizeCommand(raw)
  if (isCreation(text)) return null
  const modify = (patch, narration) => ({ narration, actions:[{type:'modify',targetId:target(text),...patch}] })
  if (/^(?:clear|reset|delete|remove)(?: (?:the |this )?(?:world|scene|everything|all|all objects))?$/.test(text)) return {narration:'A clean canvas.',actions:[{type:'clear'}]}
  if (/^(?:delete|remove)(?: (?:it|this|that|the .+))?$/.test(text)) return {narration:'Object removed.',actions:[{type:'delete',targetId:target(text)}]}
  if (/^(?:turn (?:off|on) (?:the )?gravity|(?:set |switch to )?(?:zero|no|moon|earth|normal|low)[ -]?gravity|gravity (?:off|on|zero|earth|moon))$/.test(text)) {
    const gravity=/off|zero|no /.test(text)?'zero':/moon|low/.test(text)?'low':'normal'
    return {narration:gravity==='zero'?'Zero gravity. Objects can drift.':gravity==='low'?'Moon gravity enabled.':'Earth gravity enabled.',actions:[{type:'environment',gravity}]}
  }
  const light=text.match(/^(?:(?:make(?: it)?|set(?: lighting)?(?: to)?|switch(?: lighting)? to)\s+)?(night|midnight|sunset|dawn|studio|day)(?: lighting| light|time)?$/)
  if(light){const preset={midnight:'night',day:'studio'}[light[1]]||light[1];return {narration:`Lighting changed to ${preset}.`,actions:[{type:'environment',preset}]}}
  if(/^(?:(?:make|scale|resize) (?:it|this|that|the .+?) )?(?:bigger|larger|grow|smaller|shrink)$/.test(text)) return modify({scale:/smaller|shrink/.test(text)?.8:1.25},'Size updated.')
  const size=text.match(/^(?:scale|resize|make) (?:it|this|that|the .+?) (?:by |to )?(\d+(?:\.\d+)?)\s*(?:x|times|times bigger)$/)
  if(size)return modify({scale:Math.min(4,Math.max(.25,Number(size[1])))},'Size updated.')
  if(/^(?:make|paint|colou?r|turn|change)\b/.test(text)){
    const partColors=partColorsFromText(text)
    if(Object.keys(partColors).length)return {narration:'Updated the model’s color sections.',actions:Object.entries(partColors).map(([colorPart,color])=>({type:'modify',colorPart,color}))}
    const color=Object.keys(COLORS).find((word)=>new RegExp(`\\b${word}\\b`).test(text))
    const section=text.match(/\b(hull|decks?|windows?|rails?|lifeboats?|funnels?|vents?)\b/)
    if(color&&section){const part=section[1].replace(/^(deck|window|rail|lifeboat|vent)$/,'$1s').replace(/^funnels$/,'funnel');return modify({color:COLORS[color],colorPart:part},`Changed ${section[1]} to ${color}.`)}
    if(color)return modify({color:COLORS[color]},`Changed the color to ${color}.`)
    const material=text.match(/\b(metal|metallic|matte|plastic|glass|wood|wooden|glowing)\b/)
    if(material)return modify({material:{metallic:'metal',wooden:'wood',glowing:'glow'}[material[1]]||material[1]},'Surface material updated.')
    if(/\bfloat$/.test(text))return modify({physics:'float',behavior:{kind:'float',speed:.35}},'The object is floating.')
  }
  const rotation=text.match(/^(?:rotate|turn|spin|flip)(?: (?:it|this|that|the model))?(?: by)?\s*(-?\d+(?:\.\d+)?)?\s*(?:deg(?:rees)?|°)?\s*(?:on|around|about|along)?\s*(?:the )?([xyz])(?:[ -]*axis)?$/)
  if(rotation)return modify({rotate:{axis:rotation[2],degrees:Number(rotation[1]||90)}},`Turned on the ${rotation[2].toUpperCase()} axis.`)
  const direction=text.match(/^(?:move|nudge) (?:it|this|that|the .+?) (left|right|up|down|closer|farther|further)$/)
  if(direction){const delta={left:[-1,0,0],right:[1,0,0],up:[0,1,0],down:[0,-1,0],closer:[0,0,1],farther:[0,0,-1],further:[0,0,-1]}[direction[1]];return modify({translate:delta},'Position updated.')}
  if(/^(?:spin|start spinning|make it spin)$/.test(text))return modify({behavior:{kind:'spin',speed:.4}},'Slow rotation enabled.')
  if(/^(?:stop spinning|stop moving|make it still)$/.test(text))return modify({behavior:{kind:'none'}},'Motion stopped.')
  return null
}
