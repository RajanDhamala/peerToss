package controller

type Controller struct {
	username string
}

func NewController(username string) *Controller {
	return &Controller{
		username: username,
	}
}
