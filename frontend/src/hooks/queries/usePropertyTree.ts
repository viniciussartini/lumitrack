import { useQuery } from "@tanstack/react-query"
import { propertyService } from "@/services/property.service"
import { queryKeys } from "@/lib/queryClient"

/**
 * Árvore Propriedade → Área → Dispositivo do usuário autenticado, numa única
 * requisição (sem consulta por nível). Invalidada por qualquer escrita em
 * propriedade, área ou dispositivo.
 */
export const usePropertyTree = () =>
    useQuery({
        queryKey: queryKeys.propertyTree.all,
        queryFn: () => propertyService.getTree(),
    })
