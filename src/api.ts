const jsonHeaders = { "Content-Type": "application/json" };
export class ApiError extends Error { constructor(message:string,public status:number){super(message)} }

async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(path,init);
  if(!response.ok){const body=await response.json().catch(()=>({error:"Something went wrong."}));throw new ApiError(body.error||`Request failed (${response.status})`,response.status)}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}

export const api={
  get:<T>(path:string)=>request<T>(path),
  post:<T>(path:string,body:unknown)=>request<T>(path,{method:"POST",headers:jsonHeaders,body:JSON.stringify(body)}),
  put:<T>(path:string,body:unknown)=>request<T>(path,{method:"PUT",headers:jsonHeaders,body:JSON.stringify(body)}),
  delete:<T>(path:string)=>request<T>(path,{method:"DELETE"}),
  upload:<T>(path:string,form:FormData)=>request<T>(path,{method:"POST",body:form}),
};
