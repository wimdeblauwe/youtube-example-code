package com.wimdeblauwe.formhandlingthymeleaf.user.web;

import com.wimdeblauwe.formhandlingthymeleaf.user.User;
import com.wimdeblauwe.formhandlingthymeleaf.user.usecase.CreateUser;
import com.wimdeblauwe.formhandlingthymeleaf.user.usecase.GetUsers;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
@RequestMapping("/users")
public class UserController {

    private final CreateUser createUser;
    private final GetUsers getUsers;

    public UserController(CreateUser createUser, GetUsers getUsers) {
        this.createUser = createUser;
        this.getUsers = getUsers;
    }

    @GetMapping("/create")
    public String showCreateUserForm(Model model) {
        model.addAttribute("formData", new CreateUserFormData());
        return "users/create";
    }

    @PostMapping("/create")
    public String createUser(@Valid @ModelAttribute("formData") CreateUserFormData formData, BindingResult bindingResult) {
        if (bindingResult.hasErrors()) {
            return "users/create";
        }

        createUser.execute(formData.toParameters());

        return "redirect:/users";
    }

    @GetMapping
    public String list(Model model) {
        List<User> users = getUsers.execute();
        model.addAttribute("users", users);
        return "users/list";
    }
}
