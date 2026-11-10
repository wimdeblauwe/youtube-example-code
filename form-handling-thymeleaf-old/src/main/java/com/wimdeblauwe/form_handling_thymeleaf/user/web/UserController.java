package com.wimdeblauwe.form_handling_thymeleaf.user.web;

import com.wimdeblauwe.form_handling_thymeleaf.user.User;
import com.wimdeblauwe.form_handling_thymeleaf.user.usecase.CreateUser;
import com.wimdeblauwe.form_handling_thymeleaf.user.usecase.GetUsers;
import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

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

    @GetMapping
    public String list(Model model) {
        List<User> users = getUsers.execute();
        model.addAttribute("users", users);
        return "users/list";
    }

    @GetMapping("/create")
    public String showCreateUserForm(Model model) {
        model.addAttribute("formData", new CreateUserFormData());
        return "users/create";
    }

    @PostMapping("/create")
    public String createUser(@Valid @ModelAttribute("formData") CreateUserFormData formData,
                             BindingResult bindingResult) {
        if(bindingResult.hasErrors()) {
            return "users/create";
        }

        createUser.execute(formData.toParameters());

        return "redirect:/users";
    }
}
