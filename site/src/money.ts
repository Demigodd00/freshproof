export function formatGen(atto:string):string{
  const amount=BigInt(atto||'0');
  const leading=amount/10n**18n;
  const fraction=(amount%10n**18n).toString().padStart(18,'0').slice(0,5).replace(/0+$/,'');
  return `${leading}${fraction?'.'+fraction:''} GEN`;
}

export function parseGenAtto(value:string):bigint{
  if(!/^\d+(\.\d{1,18})?$/.test(value))throw new Error('Reward must be a positive GEN amount with at most 18 decimals.');
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));
}
