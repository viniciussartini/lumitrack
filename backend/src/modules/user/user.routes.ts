import { Router } from "express"
import { UserController } from "@/modules/user/user.controller.js"
import { authenticate } from "@/shared/middlewares/authenticate.js"

const router = Router()
const userController = new UserController()

// Rotas públicas
// Cadastro de novo usuário — não exige autenticação.
router.post("/", (req, res, next) => userController.create(req, res, next))

// Rotas protegidas
// O middleware `authenticate` é aplicado individualmente em cada rota protegida.
router.get("/:id", authenticate, (req, res, next) => userController.findById(req, res, next))
router.put("/:id", authenticate, (req, res, next) => userController.update(req, res, next))
router.delete("/:id", authenticate, (req, res, next) => userController.delete(req, res, next))

export { router as userRoutes }